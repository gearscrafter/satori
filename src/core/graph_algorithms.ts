import { ProjectGraphModel } from "../types/index";

/**
 * Calculates the in-degree (incoming connections) and out-degree (outgoing connections) for each node in the graph.
 * Modifies the nodes array in-place, adding the inDegree and outDegree properties.
 * @param graph The graph object containing the nodes and edges arrays.
 */
export function calculateNodeDegrees(graph: { nodes: any[], edges: any[] }): void {
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));

    for (const node of graph.nodes) {
        node.inDegree = 0;
        node.outDegree = 0;
    }

      for (const edge of graph.edges) {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

         if (sourceNode) {
            sourceNode.outDegree++;
        }

        if (targetNode) {
            targetNode.inDegree++;
        }
    }
}


/**
 * Performs a simple data flow trace through the graph.
 * @param graph The complete project graph model.
 * @param startNodeId The ID of the node (usually a field/property) from which to start.
 * @returns An array of node IDs representing the flow path.
 */
export function calculateDataFlow(graph: ProjectGraphModel, startNodeId: string): string[] {
    const path: string[] = [startNodeId];
    const visited = new Set<string>([startNodeId]);

     let currentNodeId = startNodeId;
    for (let i = 0; i < 10; i++) { 
        const writerEdge = graph.edges.find(e => e.target === currentNodeId && e.label === 'WRITES_TO' && !visited.has(e.source));
        if (writerEdge) {
            path.unshift(writerEdge.source); 
            visited.add(writerEdge.source);
            currentNodeId = writerEdge.source;
        } else {
            break; 
        }
    }

    currentNodeId = startNodeId;
    for (let i = 0; i < 10; i++) {
        const readerEdge = graph.edges.find(e => e.source === currentNodeId && e.label === 'READS_FROM' && !visited.has(e.target));
        if (readerEdge) {
            path.push(readerEdge.target);
            visited.add(readerEdge.target);
            currentNodeId = readerEdge.target;
        } else {
            break;
        }
    }

    return path;
}
