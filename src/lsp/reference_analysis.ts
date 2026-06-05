import { stripCommentsAndStrings } from "../core";
import { ProjectGraphModel, ProjectGraphNode, EnrichedSymbol, ProjectGraphEdge } from "../types/index";
import * as vscode from 'vscode';
import { log } from "../utils/logger";


let nodesByFileCache: Map<string, ProjectGraphNode[]> | null = null;

/**
 * Builds or returns the cached index of nodes grouped by file URI.
 * Avoids re-filtering the full node array on every reference lookup.
 */
function getNodesByFile(nodes: ProjectGraphNode[]): Map<string, ProjectGraphNode[]> {
    if (nodesByFileCache) return nodesByFileCache;
    nodesByFileCache = new Map<string, ProjectGraphNode[]>();
    for (const node of nodes) {
        const uri = node.data.fileUri;
        if (!nodesByFileCache.has(uri)) nodesByFileCache.set(uri, []);
        nodesByFileCache.get(uri)!.push(node);
    }
    log.debug(`[RefAnalysis] nodesByFile index built: ${nodesByFileCache.size} files`);
    return nodesByFileCache;
}

/**
 * Clears the nodesByFile cache. Call this at the start of each
 * analysis pass alongside clearFileContentCache().
 */
export function clearNodesByFileCache(): void {
    nodesByFileCache = null;
    referencesCache.clear();
    log.debug(`[RefAnalysis] nodesByFile + references cache cleared.`);
}

const referencesCache = new Map<string, vscode.Location[] | null>();


async function getReferencesForSymbol(symbol: EnrichedSymbol): Promise<vscode.Location[] | null> {
    const { line, character } = symbol.selectionRange!.start;
    const cacheKey = `${symbol.fileUri}:${line}:${character}`;
 
    if (referencesCache.has(cacheKey)) {
        const cached = referencesCache.get(cacheKey)!;
        log.debug(`[RefCache HIT] '${symbol.name}' → ${cached?.length ?? 0} refs`);
        return cached;
    }
 
    try {
        const references = await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            vscode.Uri.parse(symbol.fileUri!),
            symbol.selectionRange!.start
        ) as vscode.Location[];
 
        const result = (references && references.length > 0) ? references : null;
        referencesCache.set(cacheKey, result);
        log.debug(`[LSP] ✅ Found ${result?.length ?? 0} references for '${symbol.name}' [cached]`);
        return result;
    } catch (err) {
        referencesCache.set(cacheKey, null);
        log.error(`[GraphBuilder] ⚠️ LSP error for '${symbol.name}'`);
        return null;
    }
}

/**
 * Attempts to add a READS_FROM edge between nodes by analyzing LSP references.
 * Searches for references of the target symbol and verifies if any occur within
 * the source node's source code. Includes helper function to find the
 * function/method container that encloses a reference.
 * 
 * @param projectGraph - Project graph model
 * @param client - LSP client for reference queries
 * @param sourceNode - Source node that might read the target
 * @param targetNode - Target node that might be read
 * @param targetSymbol - Target symbol for LSP query
 * @param sourceCodeText - Source code text of the source node
 * @param createEdge - Function to create new edges
 */

export async function tryAddReadsFromEdge(
  projectGraph: ProjectGraphModel,
  sourceNode: ProjectGraphNode,
  targetNode: ProjectGraphNode,
  targetSymbol: EnrichedSymbol,
  sourceCodeText: string,
  createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void
): Promise<void> {
  const cleanedSource = stripCommentsAndStrings(sourceCodeText);
 
  if (!cleanedSource.includes(targetSymbol.name)) {
    log.debug(`[LSP] Skipping '${targetSymbol.name}' — not found in source of '${sourceNode.label}'`);
    return;
  }
 
  const references = await getReferencesForSymbol(targetSymbol);
 
  if (!references) {
    log.debug(`[LSP]  No references found for '${targetSymbol.name}'`);
    return;
  }
 
  const nodesByFile = getNodesByFile(projectGraph.nodes);
 
  for (const ref of references) {
    const container = findEnclosingFunctionOrMethodNode(nodesByFile, {
      uri: ref.uri.toString(),
      range: ref.range
    });
 
    if (container) {
      log.debug(`[LSP] Reference found within function: ${container.label}`);
    }
 
    if (container && container.id === sourceNode.id) {
      log.debug(`[LSP] 🎯 READS_FROM: '${sourceNode.label}' → '${targetNode.label}'`);
      createEdge(sourceNode.id, targetNode.id, 'READS_FROM');
      return;
    }
  }
 
  log.debug(`[LSP] 🧭 No reference found within container '${sourceNode.label}'`);
}

/**
 * Finds the function or method node that encloses a specific reference.
 * Searches in nodes from the same file and verifies if the reference range
 * is contained within the range of any method or function.
 * 
 * @param nodes - Array of graph nodes to search in
 * @param ref - Reference with URI and range to analyze
 * @returns Container node or undefined if not found
 */

function findEnclosingFunctionOrMethodNode(
    nodesByFile: Map<string, ProjectGraphNode[]>,
    ref: { uri: string; range: vscode.Range }
): ProjectGraphNode | undefined {
    const nodesInFile = nodesByFile.get(ref.uri) ?? [];
    const pos = ref.range.start;
 
    return nodesInFile.find(n => {
        const range = n.data.range;
        return (
            (n.kind === 'method' || n.kind === 'function') &&
            range !== undefined &&
            range.start.line <= pos.line &&
            range.end.line >= pos.line
        );
    });
}
