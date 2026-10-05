import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Record<string, string>;
const en = read('src/localization/en.json');
const es = read('src/localization/es.json');

suite('Localization Test Suite', () => {
    test('English and Spanish define exactly the same keys', () => {
        const missingInEs = Object.keys(en).filter(k => !(k in es));
        const missingInEn = Object.keys(es).filter(k => !(k in en));
        assert.deepStrictEqual(missingInEs, [], 'keys missing in es.json');
        assert.deepStrictEqual(missingInEn, [], 'keys missing in en.json');
    });

    test('translated texts keep the same {n} placeholders', () => {
        const placeholders = (s: string) => (s.match(/\{\d+\}/g) || []).sort().join(',');
        const mismatched = Object.keys(en).filter(k => k in es && placeholders(en[k]) !== placeholders(es[k]));
        assert.deepStrictEqual(mismatched, []);
    });

    test('no translation is empty', () => {
        [en, es].forEach(dict => Object.entries(dict).forEach(([k, v]) => assert.ok(v.trim().length > 0, k + ' is empty')));
    });

    test('the copy shipped in /localization matches the source files', () => {
        // esbuild copies src/localization to /localization; a stale copy would show old texts at runtime.
        ['en', 'es'].forEach(lang => {
            const shipped = path.join(root, 'localization', lang + '.json');
            if (fs.existsSync(shipped)) {
                assert.deepStrictEqual(read('localization/' + lang + '.json'), lang === 'en' ? en : es, lang + '.json is stale; run the build');
            }
        });
    });

    test('every key the trail view asks for exists', () => {
        const source = fs.readFileSync(path.join(root, 'media/trail/trail_view.js'), 'utf8');
        const staticKeys = new Set<string>();
        for (const m of source.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) {
            if (!m[1].endsWith('.')) { staticKeys.add(m[1]); } // "layer." + x style prefixes are listed below
        }

        const dynamic: string[] = [];
        ['calls', 'inherit', 'data', 'types'].forEach(g => dynamic.push('trail.filter.' + g, 'trail.tip.filter.' + g));
        ['view', 'state', 'service', 'model', 'utility'].forEach(l => dynamic.push('layer.' + l, 'hud.layer.' + l));
        ['pen', 'line', 'arrow', 'rect', 'ellipse', 'eraser'].forEach(tool => dynamic.push('trail.edit.' + tool));
        ['calls', 'extends', 'implements', 'reads', 'writes', 'creates', 'type'].forEach(a => dynamic.push('hud.arrows.' + a));
        ['providers', 'consumers'].forEach(s => dynamic.push('trail.trace.' + s));
        ['hud.use.click', 'hud.use.right', 'hud.use.drag', 'hud.use.arrow', 'hud.use.edit'].forEach(k => dynamic.push(k));

        const missing = [...staticKeys, ...dynamic].filter(k => !(k in en));
        assert.deepStrictEqual(missing, []);
        assert.ok(staticKeys.size > 40, 'expected to find the keys used by the view, found ' + staticKeys.size);
    });
});
