import { stripCommentsAndStrings } from "../core";
import { ProjectGraphModel, ProjectGraphNode, EnrichedSymbol, ProjectGraphEdge } from "../types/index";
import * as vscode from 'vscode';
import { log } from "../utils/logger";

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
  try {
    const references = await vscode.commands.executeCommand(
      'vscode.executeReferenceProvider',
      vscode.Uri.parse(targetSymbol.fileUri!),
      targetSymbol.selectionRange!.start
    ) as vscode.Location[];
    if (references && references.length > 0) {
      log.debug(`[LSP] ✅ Found  ${references.length} references for '${targetSymbol.name}'`);
    for (const ref of references) {
        const refLsp = {
          uri: ref.uri.toString(),
          range: ref.range
        };

        const container = findEnclosingFunctionOrMethodNode(projectGraph.nodes, refLsp);
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
    } else {
      log.debug(`[LSP] ❌ No references found for  '${targetSymbol.name}'`);
    }
  } catch (err) {
    log.error(`[GraphBuilder] ⚠️ LSP fallback for '${targetSymbol.name}'`);
  }
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
  nodes: ProjectGraphNode[],
  ref: { uri: string; range: vscode.Range }
): ProjectGraphNode | undefined {
  const nodesInFile = nodes.filter(n => n.data.fileUri === ref.uri);
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
