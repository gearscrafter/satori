import { stripCommentsAndStrings, escapeRegExp } from "../core";
import { ProjectGraphModel, EnrichedSymbol, ProjectGraphEdge, ProjectGraphNode } from "../types/index";
import { getSourceCodeForSymbol } from "../analysis/source_analyzer";
import { tryAddReadsFromEdge } from "../lsp/reference_analysis";
import { log } from "../utils/logger";
import { integrateExternalPackages } from "../packages/graph_integration/integration";

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
  generatedNodeIds?: Set<string> 
): Promise<void> {
  log.debug(`[GraphBuilder] Creating edges...`);

  if (projectRoot && generatedNodeIds) {
    log.debug(`[GraphBuilder] Integrating external packages...`);
    const nodesBefore = projectGraph.nodes.length;
    
    await integrateExternalPackages(
      projectGraph,
      projectRoot,
      generatedNodeIds,
      createEdge
    );

    const nodesAfter = projectGraph.nodes.length;
    log.debug(`Package containers created: ${nodesAfter - nodesBefore}`);
  }

  const symbolNameIndex = new Map<string, EnrichedSymbol[]>();
  for (const enriched of symbolMapById.values()) {
    const name = enriched.name;
    if (!symbolNameIndex.has(name)) {
      symbolNameIndex.set(name, []);
    }
    symbolNameIndex.get(name)!.push(enriched);
  }

  for (const sourceNode of projectGraph.nodes) {
    const sourceSymbol = symbolMapById.get(sourceNode.id);
    if (!sourceSymbol) {
      log.debug(`⚠️ Node without symbol: ${sourceNode.id}`);
      continue;
    }

    if (sourceSymbol.relations) {
        log.debug(`[DEBUG] ${sourceSymbol.name} relations: ${JSON.stringify(sourceSymbol.relations)}`);
      const findClassNodeByName = (name: string): ProjectGraphNode | undefined => {
        const baseName = name.split('<')[0].trim();
        return projectGraph.nodes.find(n => n.kind === 'class' && n.label === baseName);
      };

      sourceSymbol.relations.extends?.forEach(ext => {
        const parentName = typeof ext === 'string' ? ext : ext.name;
        const targetNode = findClassNodeByName(parentName);
        if (targetNode) createEdge(sourceNode.id, targetNode.id, 'EXTENDS');
      });

      sourceSymbol.relations.implements?.forEach(impl => {
        const interfaceName = typeof impl === 'string' ? impl : impl.name;
        const targetNode = findClassNodeByName(interfaceName);
        if (targetNode) createEdge(sourceNode.id, targetNode.id, 'IMPLEMENTS');
      });
    }

    if (
      sourceNode.kind === 'method' ||
      sourceNode.kind === 'function' ||
      sourceNode.kind === 'constructor'
    ) {
      const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
      if (!sourceCodeText) return;
        log.debug(`[DEBUG] ${sourceSymbol.name} - sourceCodeText length: ${sourceCodeText?.length}`);

        const cleanedSource = stripCommentsAndStrings(sourceCodeText);

        const mentionedNames = Array.from(symbolNameIndex.keys()).filter(name => {
            const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`);
            return callPattern.test(cleanedSource);
        });

        log.debug(`[DEBUG] ${sourceSymbol.name} mentions: ${mentionedNames.join(', ')}`);


      for (const targetName of mentionedNames) {
        const targetSymbols = symbolNameIndex.get(targetName)!;

        for (const targetSymbol of targetSymbols) {
          const targetNode = projectGraph.nodes.find(n =>
            symbolMapById.get(n.id) === targetSymbol
          );
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
  };
}