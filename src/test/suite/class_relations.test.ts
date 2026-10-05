import * as assert from 'assert';
import { extractClassHeader, parseInheritanceClauses } from '../../analysis/class_relations';

suite('Class Relations Test Suite', () => {
    test('parses extends, with and implements separately', () => {
        const r = parseInheritanceClauses('class A extends B with M, N implements I, J');
        assert.deepStrictEqual(r, { extends: ['B'], with: ['M', 'N'], implements: ['I', 'J'] });
    });

    test('keeps generic arguments and commas inside them intact', () => {
        const r = parseInheritanceClauses('class A<T extends Object> extends Base<Map<String, int>> implements Repo<T>');
        assert.deepStrictEqual(r, { extends: ['Base<Map<String, int>>'], with: [], implements: ['Repo<T>'] });
    });

    test('returns empty clauses for a plain class', () => {
        assert.deepStrictEqual(parseInheritanceClauses('abstract class A'), { extends: [], with: [], implements: [] });
    });

    test('extractClassHeader reads a multi-line header up to the brace', () => {
        const src = 'import "x";\nclass User\n    extends Entity // base\n    with Timestamped {\n  int a = 0;\n}\n';
        const header = extractClassHeader(src, { start: { line: 1, character: 0 } });
        assert.strictEqual(header, 'class User extends Entity with Timestamped');
        assert.deepStrictEqual(parseInheritanceClauses(header), { extends: ['Entity'], with: ['Timestamped'], implements: [] });
    });

    test('extractClassHeader honours the start character', () => {
        const header = extractClassHeader('final x = 1; class A extends B {}', { start: { line: 0, character: 13 } });
        assert.strictEqual(header, 'class A extends B');
    });
});
