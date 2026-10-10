import { stripCommentsAndStrings } from "../core";
import { ProjectGraphModel, EnrichedSymbol, ProjectGraphEdge, ProjectGraphNode, ExternalPackageInfo } from "../types/index";
import { getSourceCodeForSymbol, getDeclarationForSymbol } from "../analysis/source_analyzer";
import { tryAddReadsFromEdge, addFieldAccessEdges, addAmbiguousCallEdges, setNavigationHierarchy } from "../lsp/reference_analysis";
import { methodBody } from "../analysis/signature";
import { cyclomaticComplexity } from "../analysis/complexity";
import { observedTypeNames } from "../analysis/observers";
import { typeUsage, unambiguousClassNames } from "../analysis/type_usage";
import { CalledNames } from "../analysis/called_names";
import { providerDeclarations, watchedProviders } from "../analysis/riverpod";
import * as fs from 'fs';
import { log } from "../utils/logger";
import * as vscode from 'vscode';

/**
 * Creates graph edges by analyzing symbols and their relationships. It processes
 * inheritance, implementations, method calls, and field references through
 * source code analysis and name patterns. It integrates external packages.
 * @param projectGraph - The project graph model
 * @param symbolMapById - Map of symbols by unique ID
 * @param createEdge - Function to create new edges
 * @param client - Unused parameter (kept for compatibility)
 * @param projectRoot - The root path of the project (optional)
 * @param generatedNodeIds - Set of generated node IDs (optional)
 */

export async function createGraphEdgesFromSymbols(
    projectGraph: ProjectGraphModel,
    symbolMapById: Map<string, EnrichedSymbol>,
    createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void,
    projectRoot?: string,
    generatedNodeIds?: Set<string>,
    cachedPackages?: ExternalPackageInfo[]
): Promise<void> {
    log.debug(`[GraphBuilder] Creating edges...`);
 
    setNavigationHierarchy(Array.from(symbolMapById.values()).filter(s => s.kind === vscode.SymbolKind.Class));

    const classNodeIndex = new Map<string, ProjectGraphNode>();
    for (const node of projectGraph.nodes) {
        if (node.kind === 'class' && !classNodeIndex.has(node.label)) {
            classNodeIndex.set(node.label, node);
        }
    }
 
    const nodeById = new Map<string, ProjectGraphNode>(projectGraph.nodes.map(n => [n.id, n]));
    // An enum is a type too: `final Status status;` depends on it.
    const typeNodeIndex = new Map<string, ProjectGraphNode>();
    for (const node of projectGraph.nodes) {
        if ((node.kind === 'class' || node.kind === 'enum') && !typeNodeIndex.has(node.label)) { typeNodeIndex.set(node.label, node); }
    }
    const classNames = unambiguousClassNames(projectGraph.nodes.filter(n => n.kind === 'class' || n.kind === 'enum').map(n => n.label));

    /** A member that names a class as a type, or creates it, depends on that class. */
    const addTypeEdges = (sourceNode: ProjectGraphNode, cleanedSource: string) => {
        const owner = sourceNode.parent ? nodeById.get(sourceNode.parent) : undefined;
        const usage = typeUsage(cleanedSource, classNames, owner?.label);
        for (const name of usage.created) { createEdge(sourceNode.id, typeNodeIndex.get(name)!.id, 'INSTANCE_OF'); }
        for (const name of usage.used) { createEdge(sourceNode.id, typeNodeIndex.get(name)!.id, 'USES_AS_TYPE'); }
    };

    // Riverpod: the provider variables of the project and the classes they hold, read from the text of the files.
    const providers = new Map<string, string[]>();
    const scanned = new Set<string>();
    for (const enriched of symbolMapById.values()) {
        const uri = enriched.fileUri;
        if (!uri || !uri.startsWith('file:') || scanned.has(uri)) { continue; }
        scanned.add(uri);
        try {
            const text = fs.readFileSync(vscode.Uri.parse(uri).fsPath, 'utf8');
            if (!/Provider|iverpod/.test(text)) { continue; }
            providerDeclarations(stripCommentsAndStrings(text), classNames).forEach((held, name) => providers.set(name, held));
        } catch { /* a file that cannot be read has no providers to find */ }
    }

    const symbolNameIndex = new Map<string, EnrichedSymbol[]>();
    for (const enriched of symbolMapById.values()) {
        const name = enriched.name;
        if (!symbolNameIndex.has(name)) {symbolNameIndex.set(name, []);}
        symbolNameIndex.get(name)!.push(enriched);
    }
 
    const nodeBySymbol = new Map<EnrichedSymbol, ProjectGraphNode>();
    for (const node of projectGraph.nodes) {
        const sym = symbolMapById.get(node.id);
        if (sym) {nodeBySymbol.set(sym, node);}
    }
 
    const calledNames = new CalledNames(symbolNameIndex.keys());
    log.debug(`[EdgeCreator] Indexed ${symbolNameIndex.size} symbol names.`);
 
    const usedIdentifiers = new Set<string>();
    const ambiguousCallTargets = new Set<EnrichedSymbol>();

    for (const sourceNode of projectGraph.nodes) {
        const sourceSymbol = symbolMapById.get(sourceNode.id);
        if (!sourceSymbol) {continue;}
 
        if (sourceSymbol.relations) {
            sourceSymbol.relations.extends?.forEach(ext => {
                const parentName = typeof ext === 'string' ? ext : ext.name;
                const baseName = parentName.split('<')[0].trim();
                const targetNode = classNodeIndex.get(baseName);
                if (targetNode) {createEdge(sourceNode.id, targetNode.id, 'EXTENDS');}
            });
 
            sourceSymbol.relations.with?.forEach(mixin => {
                const mixinName = typeof mixin === 'string' ? mixin : mixin.name;
                const targetNode = classNodeIndex.get(mixinName.split('<')[0].trim());
                if (targetNode) {createEdge(sourceNode.id, targetNode.id, 'IMPLEMENTS');}
            });

            sourceSymbol.relations.implements?.forEach(impl => {
                const interfaceName = typeof impl === 'string' ? impl : impl.name;
                const baseName = interfaceName.split('<')[0].trim();
                const targetNode = classNodeIndex.get(baseName);
                if (targetNode) {createEdge(sourceNode.id, targetNode.id, 'IMPLEMENTS');}
            });
        }
 
        // A field is typed: `final Repo repo;`, `List<Cart> items`.
        if (sourceNode.kind === 'field' || sourceNode.kind === 'property') {
            const declaration = getDeclarationForSymbol(sourceSymbol);
            if (declaration) { addTypeEdges(sourceNode, stripCommentsAndStrings(declaration)); }
            continue;
        }

        if (
            sourceNode.kind === 'method' ||
            sourceNode.kind === 'function' ||
            sourceNode.kind === 'constructor'
        ) {
            const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
            if (!sourceCodeText) {continue;}
 
            const cleanedSource = stripCommentsAndStrings(sourceCodeText);
            addTypeEdges(sourceNode, cleanedSource);
            for (const word of cleanedSource.matchAll(/[A-Za-z_$][\w$]*/g)) {
                usedIdentifiers.add(word[0]);
            }

            // Only the body can call something: the method's own name in its signature is not a call.
            const body = methodBody(cleanedSource);
            sourceNode.data.complexity = cyclomaticComplexity(body);

            // A widget that listens to a state holder depends on it even if it never calls a method of it.
            for (const holder of observedTypeNames(body)) {
                const holderNode = classNodeIndex.get(holder);
                if (holderNode && holderNode.id !== sourceNode.id) { createEdge(sourceNode.id, holderNode.id, 'OBSERVES'); }
            }
            // ref.watch(userProvider) depends on the class the provider holds.
            for (const providerName of watchedProviders(body)) {
                for (const held of providers.get(providerName) ?? []) {
                    const heldNode = classNodeIndex.get(held);
                    if (heldNode && heldNode.id !== sourceNode.id) { createEdge(sourceNode.id, heldNode.id, 'OBSERVES'); }
                }
            }
            const mentionedNames = calledNames.mentioned(body).filter(name => symbolNameIndex.has(name));

            for (const targetName of mentionedNames) {
                const targetSymbols = symbolNameIndex.get(targetName)!;
                const callableTargets = targetSymbols.filter(s => {
                    const n = nodeBySymbol.get(s);
                    return n && (n.kind === 'method' || n.kind === 'function');
                });

                for (const targetSymbol of targetSymbols) {
                    const targetNode = nodeBySymbol.get(targetSymbol);
                    if (!targetNode || sourceNode.id === targetNode.id) {continue;}

                    if (targetNode.kind === 'method' || targetNode.kind === 'function') {
                        if (callableTargets.length === 1) {
                            createEdge(sourceNode.id, targetNode.id, 'CALLS');
                        } else {
                            // Several methods share this name; the language server tells which one is really called.
                            ambiguousCallTargets.add(targetSymbol);
                        }
                    } else {
                        await tryAddReadsFromEdge(
                            projectGraph,
                            sourceNode,
                            targetNode,
                            targetSymbol,
                            sourceCodeText,
                            createEdge
                        );
                    }
                }
            }
        }
    }

    await addAmbiguousCallEdges(projectGraph, symbolMapById, ambiguousCallTargets, createEdge);
    await addFieldAccessEdges(projectGraph, symbolMapById, usedIdentifiers, projectRoot, createEdge);
}