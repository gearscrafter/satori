import { stripCommentsAndStrings, escapeRegExp } from "../core";
import { ProjectGraphModel, EnrichedSymbol, ProjectGraphEdge, ProjectGraphNode, ExternalPackageInfo } from "../types/index";
import { getSourceCodeForSymbol } from "../analysis/source_analyzer";
import { tryAddReadsFromEdge, addFieldAccessEdges, addAmbiguousCallEdges } from "../lsp/reference_analysis";
import { methodBody } from "../analysis/signature";
import { cyclomaticComplexity } from "../analysis/complexity";
import { log } from "../utils/logger";

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
 
    const classNodeIndex = new Map<string, ProjectGraphNode>();
    for (const node of projectGraph.nodes) {
        if (node.kind === 'class' && !classNodeIndex.has(node.label)) {
            classNodeIndex.set(node.label, node);
        }
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
 
    const symbolPatterns = new Map<string, RegExp>();
    for (const name of symbolNameIndex.keys()) {
        symbolPatterns.set(name, new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`));
    }
    log.debug(`[EdgeCreator] Pre-compiled ${symbolPatterns.size} RegExp patterns.`);
 
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
 
            sourceSymbol.relations.implements?.forEach(impl => {
                const interfaceName = typeof impl === 'string' ? impl : impl.name;
                const baseName = interfaceName.split('<')[0].trim();
                const targetNode = classNodeIndex.get(baseName);
                if (targetNode) {createEdge(sourceNode.id, targetNode.id, 'IMPLEMENTS');}
            });
        }
 
        if (
            sourceNode.kind === 'method' ||
            sourceNode.kind === 'function' ||
            sourceNode.kind === 'constructor'
        ) {
            const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
            if (!sourceCodeText) {continue;}
 
            const cleanedSource = stripCommentsAndStrings(sourceCodeText);
            for (const word of cleanedSource.matchAll(/[A-Za-z_$][\w$]*/g)) {
                usedIdentifiers.add(word[0]);
            }

            // Only the body can call something: the method's own name in its signature is not a call.
            const body = methodBody(cleanedSource);
            sourceNode.data.complexity = cyclomaticComplexity(body);
            const mentionedNames: string[] = [];
            for (const [name, pattern] of symbolPatterns) {
                if (pattern.test(body)) {
                    mentionedNames.push(name);
                }
            }

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