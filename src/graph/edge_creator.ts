import { stripCommentsAndStrings, escapeRegExp } from "../core";
import { ProjectGraphModel, EnrichedSymbol, ProjectGraphEdge, ProjectGraphNode, ExternalPackageInfo } from "../types/index";
import { getSourceCodeForSymbol } from "../analysis/source_analyzer";
import { tryAddReadsFromEdge } from "../lsp/reference_analysis";
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
        if (node.kind === 'class') {
            classNodeIndex.set(node.label, node);
        }
    }
 
    const symbolNameIndex = new Map<string, EnrichedSymbol[]>();
    for (const enriched of symbolMapById.values()) {
        const name = enriched.name;
        if (!symbolNameIndex.has(name)) symbolNameIndex.set(name, []);
        symbolNameIndex.get(name)!.push(enriched);
    }
 
    const nodeBySymbol = new Map<EnrichedSymbol, ProjectGraphNode>();
    for (const node of projectGraph.nodes) {
        const sym = symbolMapById.get(node.id);
        if (sym) nodeBySymbol.set(sym, node);
    }
 
    const symbolPatterns = new Map<string, RegExp>();
    for (const name of symbolNameIndex.keys()) {
        symbolPatterns.set(name, new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`));
    }
    log.debug(`[EdgeCreator] Pre-compiled ${symbolPatterns.size} RegExp patterns.`);
 
    for (const sourceNode of projectGraph.nodes) {
        const sourceSymbol = symbolMapById.get(sourceNode.id);
        if (!sourceSymbol) continue;
 
        if (sourceSymbol.relations) {
            sourceSymbol.relations.extends?.forEach(ext => {
                const parentName = typeof ext === 'string' ? ext : ext.name;
                const baseName = parentName.split('<')[0].trim();
                const targetNode = classNodeIndex.get(baseName);
                if (targetNode) createEdge(sourceNode.id, targetNode.id, 'EXTENDS');
            });
 
            sourceSymbol.relations.implements?.forEach(impl => {
                const interfaceName = typeof impl === 'string' ? impl : impl.name;
                const baseName = interfaceName.split('<')[0].trim();
                const targetNode = classNodeIndex.get(baseName);
                if (targetNode) createEdge(sourceNode.id, targetNode.id, 'IMPLEMENTS');
            });
        }
 
        if (
            sourceNode.kind === 'method' ||
            sourceNode.kind === 'function' ||
            sourceNode.kind === 'constructor'
        ) {
            const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
            if (!sourceCodeText) continue;
 
            const cleanedSource = stripCommentsAndStrings(sourceCodeText);
 
            const mentionedNames: string[] = [];
            for (const [name, pattern] of symbolPatterns) {
                if (pattern.test(cleanedSource)) {
                    mentionedNames.push(name);
                }
            }
 
            for (const targetName of mentionedNames) {
                const targetSymbols = symbolNameIndex.get(targetName)!;
 
                for (const targetSymbol of targetSymbols) {
                    const targetNode = nodeBySymbol.get(targetSymbol);
                    if (!targetNode || sourceNode.id === targetNode.id) continue;
 
                    if (targetNode.kind === 'method' || targetNode.kind === 'function') {
                        createEdge(sourceNode.id, targetNode.id, 'CALLS');
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
}