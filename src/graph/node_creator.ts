import { SymbolKindToString, KIND_CLASS, KIND_ENUM } from "../core";
import { EnrichedSymbol, ProjectGraphModel, ProjectGraphNode } from "../types/index";
import { log } from "../utils/logger";
import { getArchitecturalLayer } from "./layer_classifier";

/**
 * Creates graph nodes from enriched symbols by recursively processing
 * the symbol hierarchy. It determines architectural layers, establishes parent-child
 * relationships, and handles both top-level symbols and nested members
 * while maintaining bidirectional references.
 *
 * @param enrichedFiles - Array of files with enriched symbols.
 * @param projectGraph - The graph model where nodes will be added.
 * @param symbolMapById - Map to store symbols by ID.
 * @param generateGlobalSymbolId - Function to generate unique IDs.
 * @param generatedNodeIds - Set to track already generated IDs.
 */
export function createGraphNodesFromSymbols(
  enrichedFiles: Array<{ fileUri: string; symbols: EnrichedSymbol[]; }>, projectGraph: ProjectGraphModel, symbolMapById: Map<string, EnrichedSymbol>, generateGlobalSymbolId: (symbol: EnrichedSymbol, parentName?: string) => string, generatedNodeIds: Set<string>): void {

  function recursive(symbols: EnrichedSymbol[], parentClass?: EnrichedSymbol, fileUri?: string) {
    if (!symbols) return;
    for (const s of symbols) {
      s.fileUri = s.fileUri || fileUri;
      const nodeId = generateGlobalSymbolId(s, parentClass?.name);

      const parentId = parentClass ? generateGlobalSymbolId(parentClass, undefined) : undefined;


      if (parentClass) {
        log.debug(`[DEBUG-PARENT] ${s.name} has parent${parentClass.name}`);
        log.debug(`[DEBUG-PARENT-ID] ${s.name} → parentId: ${parentId}`);
      } else {
        log.debug(`[DEBUG-PARENT] ${s.name} has no parent (is top-level)`);
      }

      if (!generatedNodeIds.has(nodeId)) {
        generatedNodeIds.add(nodeId);

        const layer: ProjectGraphNode['data']['layer'] = getArchitecturalLayer(s, s.relations);

        log.debug(`[DEBUG-RECURSIVE-PARENT] Processing: ${s.name}, parentClass: ${parentClass?.name ?? 'none'}`);

        const node: ProjectGraphNode = {
          id: nodeId,
          label: s.name,
          kind: SymbolKindToString(s.kind),
          data: {
            fileUri: s.fileUri!,
            range: s.range,
            selectionRange: s.selectionRange,
            isSDK: !!s.isSDK,
            access: s.access,
            layer,
          },
          parent: parentId,
        };
        
       log.debug(`[DEBUG-GRAPH] Agdding node: ${node.label}, Layer: ${layer}, Parent: ${node.parent}`);
       log.debug(`[DEBUG-KIND] ${s.name} (kind: ${SymbolKindToString(s.kind)})`);

        projectGraph.nodes.push(node);
      }

      symbolMapById.set(nodeId, s);

      const isContainerSymbol = s.kind === KIND_CLASS || s.kind === KIND_ENUM || (s.children?.length ?? 0) > 0;
      const nextParent = isContainerSymbol ? s : parentClass;

      if (s.children) {
         recursive(s.children, nextParent, s.fileUri);
      }
    }
  }

  for (const file of enrichedFiles) {
    recursive(file.symbols, undefined, file.fileUri);
  }
}