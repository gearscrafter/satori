import * as assert from 'assert';
import { createGraphEdgesFromSymbols } from '../../graph/edge_creator';
import { EnrichedSymbol, ProjectGraphEdge, ProjectGraphModel, ProjectGraphNode } from '../../types/index';

suite('Edge Creator Test Suite', () => {

    const classNode = (id: string, label: string): ProjectGraphNode => ({
        id,
        label,
        kind: 'class',
        data: { fileUri: `file:///test/${id}.dart` }
    });

    async function buildEdges(
        nodes: ProjectGraphNode[],
        symbols: Record<string, Partial<EnrichedSymbol>>
    ) {
        const graph: ProjectGraphModel = { nodes, edges: [] };
        const symbolMap = new Map<string, EnrichedSymbol>();
        for (const [id, sym] of Object.entries(symbols)) {
            symbolMap.set(id, { kind: 5, ...sym } as EnrichedSymbol);
        }
        const edges: Array<[string, string, ProjectGraphEdge['label']]> = [];
        await createGraphEdgesFromSymbols(
            graph,
            symbolMap,
            (s, t, l) => { edges.push([s, t, l]); },
            undefined,
            new Set(nodes.map(n => n.id)),
            []
        );
        return edges;
    }

    test('creates EXTENDS edge to the parent class', async () => {
        const edges = await buildEdges(
            [classNode('child', 'Child'), classNode('base', 'Base')],
            {
                child: { name: 'Child', relations: { extends: ['Base'] } },
                base: { name: 'Base' }
            }
        );
        assert.deepStrictEqual(edges, [['child', 'base', 'EXTENDS']]);
    });

    test('strips generics when resolving EXTENDS and IMPLEMENTS targets', async () => {
        const edges = await buildEdges(
            [classNode('child', 'Child'), classNode('base', 'Base'), classNode('iface', 'Iface')],
            {
                child: { name: 'Child', relations: { extends: ['Base<T>'], implements: ['Iface<String>'] } },
                base: { name: 'Base' },
                iface: { name: 'Iface' }
            }
        );
        assert.deepStrictEqual(edges, [
            ['child', 'base', 'EXTENDS'],
            ['child', 'iface', 'IMPLEMENTS']
        ]);
    });

    test('with duplicate class names, the first declared class wins', async () => {
        const edges = await buildEdges(
            [classNode('child', 'Child'), classNode('first', 'Dup'), classNode('second', 'Dup')],
            {
                child: { name: 'Child', relations: { extends: ['Dup'] } },
                first: { name: 'Dup' },
                second: { name: 'Dup' }
            }
        );
        assert.deepStrictEqual(edges, [['child', 'first', 'EXTENDS']]);
    });

    test('ignores relations to classes not in the graph', async () => {
        const edges = await buildEdges(
            [classNode('child', 'Child')],
            { child: { name: 'Child', relations: { extends: ['Missing'] } } }
        );
        assert.deepStrictEqual(edges, []);
    });
});
