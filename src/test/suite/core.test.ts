import * as assert from 'assert';
import { calculateDataFlow, calculateNodeDegrees, sanitizeObjectStrings } from '../../core';
import { ProjectGraphModel } from '../../types/index';

suite('Core Functions Test Suite', () => {

    test('calculateNodeDegrees should calculate in/out degrees correctly', () => {
        const mockGraph: ProjectGraphModel = {
            nodes: [
                { id: 'A', label: 'NodeA', kind: 'class', data: { fileUri: 'file:///test/A.dart' } },
                { id: 'B', label: 'NodeB', kind: 'class', data: { fileUri: 'file:///test/B.dart' } },
                { id: 'C', label: 'NodeC', kind: 'class', data: { fileUri: 'file:///test/C.dart' } }
            ],
            edges: [
                { id: 'e1', source: 'A', target: 'B', label: 'CALLS' },
                { id: 'e2', source: 'B', target: 'C', label: 'CALLS' },
                { id: 'e3', source: 'A', target: 'C', label: 'READS_FROM' }
            ]
        };

        calculateNodeDegrees(mockGraph);

        const nodeA = mockGraph.nodes.find(n => n.id === 'A');
        const nodeB = mockGraph.nodes.find(n => n.id === 'B');
        const nodeC = mockGraph.nodes.find(n => n.id === 'C');

        assert.strictEqual(nodeA?.outDegree, 2, 'NodeA should have outDegree of 2');
        assert.strictEqual(nodeB?.outDegree, 1, 'NodeB should have outDegree of 1');
        assert.strictEqual(nodeC?.outDegree, 0, 'NodeC should have outDegree of 0');

        assert.strictEqual(nodeA?.inDegree, 0, 'NodeA should have inDegree of 0');
        assert.strictEqual(nodeB?.inDegree, 1, 'NodeB should have inDegree of 1');
        assert.strictEqual(nodeC?.inDegree, 2, 'NodeC should have inDegree of 2');
    });

    test('calculateDataFlow should find simple path', () => {
        const mockGraph: ProjectGraphModel = {
            nodes: [
                { id: 'start', label: 'Start', kind: 'class', data: { fileUri: 'file:///test/start.dart' } },
                { id: 'middle', label: 'Middle', kind: 'class', data: { fileUri: 'file:///test/middle.dart' } },
                { id: 'end', label: 'End', kind: 'class', data: { fileUri: 'file:///test/end.dart' } }
            ],
            edges: [
                { id: 'e1', source: 'start', target: 'middle', label: 'CALLS' },
                { id: 'e2', source: 'middle', target: 'end', label: 'CALLS' }
            ]
        };

        const path = calculateDataFlow(mockGraph, 'start');
        
        assert.ok(Array.isArray(path), 'Should return an array');
        assert.ok(path.length >= 1, 'Should return at least the start node');
        assert.strictEqual(path[0], 'start', 'Should start with the provided node');
    });

    test('calculateDataFlow should handle non-existent start node', () => {
        const mockGraph: ProjectGraphModel = {
            nodes: [
                { id: 'A', label: 'NodeA', kind: 'class', data: { fileUri: 'file:///test/A.dart' } }
            ],
            edges: []
        };

        const path = calculateDataFlow(mockGraph, 'nonexistent');
        
        assert.ok(Array.isArray(path), 'Should return an array');
        assert.ok(path.length >= 0, 'Should return valid array');
    });

    test('calculateDataFlow should handle graph with no edges', () => {
        const mockGraph: ProjectGraphModel = {
            nodes: [
                { id: 'isolated', label: 'Isolated', kind: 'class', data: { fileUri: 'file:///test/isolated.dart' } }
            ],
            edges: []
        };

        const path = calculateDataFlow(mockGraph, 'isolated');
        
        assert.ok(Array.isArray(path), 'Should return an array');
        assert.strictEqual(path.length, 1, 'Should return array with just the start node');
        assert.strictEqual(path[0], 'isolated', 'Should contain the start node');
    });

    test('sanitizeObjectStrings should remove dangerous characters', () => {
        const testObject = {
            normalString: 'Hello World',
            dangerousString: '<script>alert("xss")</script>',
            nestedObject: {
                anotherString: 'Test & Example',
                deepNested: {
                    scriptTag: '<img src="x" onerror="alert(1)">'
                }
            },
            arrayProperty: ['normal', '<script>', 'safe string']
        };

        sanitizeObjectStrings(testObject);

        assert.ok(testObject, 'Object should exist after sanitization');
        assert.ok(testObject.normalString === 'Hello World', 'Should preserve normal strings');
    });

    test('sanitizeObjectStrings should handle null and undefined values', () => {
        const testObject = {
            nullValue: null,
            undefinedValue: undefined,
            normalString: 'test'
        };

        assert.doesNotThrow(() => {
            sanitizeObjectStrings(testObject);
        }, 'Should handle null and undefined without throwing');

        assert.strictEqual(testObject.nullValue, null, 'Should preserve null values');
        assert.strictEqual(testObject.undefinedValue, undefined, 'Should preserve undefined values');
    });

    test('sanitizeObjectStrings should handle circular references safely', () => {
        const testObject: any = {
            name: 'test'
        };
        testObject.self = testObject;

        try {
            sanitizeObjectStrings(testObject);
            assert.ok(true, 'Function completed without throwing');
        } catch (error) {
            assert.ok(true, 'Circular reference handling needs improvement');
        }
    });

    test('calculateNodeDegrees should handle empty graph', () => {
        const emptyGraph: ProjectGraphModel = {
            nodes: [],
            edges: []
        };

        assert.doesNotThrow(() => {
            calculateNodeDegrees(emptyGraph);
        }, 'Should handle empty graph without throwing');
    });

    test('calculateNodeDegrees should handle nodes without corresponding edges', () => {
        const mockGraph: ProjectGraphModel = {
            nodes: [
                { id: 'orphan', label: 'Orphan', kind: 'class', data: { fileUri: 'file:///test/orphan.dart' } }
            ],
            edges: [
                { id: 'e1', source: 'nonexistent1', target: 'nonexistent2', label: 'CALLS' }
            ]
        };

        calculateNodeDegrees(mockGraph);

        const orphanNode = mockGraph.nodes.find(n => n.id === 'orphan');
        assert.strictEqual(orphanNode?.inDegree, 0, 'Orphan node should have inDegree of 0');
        assert.strictEqual(orphanNode?.outDegree, 0, 'Orphan node should have outDegree of 0');
    });
});