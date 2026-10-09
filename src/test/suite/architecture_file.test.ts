import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { architectureDigest, architectureFileFor, discoverFolders, findArchitectureFile, loadArchitecture, viewArchitecture, writeLayerOverride } from '../../analysis/architecture_file';
import { defaultArchitecture, KNOWN_ICONS } from '../../analysis/architecture_config';

suite('Architecture File Test Suite', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-arch-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    const write = (rel: string, text: string) => {
        const file = path.join(dir, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
        return file;
    };
    const arch = JSON.stringify({ architecture: { layers: [{ id: 'ui' }, { id: 'logic' }] } });

    test('finds the file in the analysed folder', () => {
        const file = write('satori.json', arch);
        assert.strictEqual(findArchitectureFile(dir), file);
    });

    test('finds it in a parent folder of a subfolder of the project', () => {
        write('pubspec.yaml', 'name: x');
        const file = write('satori.json', arch);
        fs.mkdirSync(path.join(dir, 'lib', 'feature'), { recursive: true });
        assert.strictEqual(findArchitectureFile(path.join(dir, 'lib', 'feature')), file);
    });

    test('does not look beyond the folder of the pubspec', () => {
        write('satori.json', arch);
        write('app/pubspec.yaml', 'name: app');
        assert.strictEqual(findArchitectureFile(path.join(dir, 'app')), undefined);
    });

    test('no file means the default architecture', () => {
        const loaded = loadArchitecture(dir);
        assert.strictEqual(loaded.file, undefined);
        assert.strictEqual(loaded.architecture.builtin, true);
        assert.deepStrictEqual(loaded.problems, []);
    });

    test('loads the file and reports its problems', () => {
        write('satori.json', JSON.stringify({ architecture: { layers: [{ id: 'ui' }, { id: 'Bad' }] } }));
        const loaded = loadArchitecture(dir);
        assert.deepStrictEqual(loaded.architecture.layers.map(l => l.id), ['ui', 'other']);
        assert.strictEqual(loaded.problems.length, 1);
        assert.ok(loaded.file!.endsWith('satori.json'));
    });

    test('the page gets the layers, the rules and the classes placed by hand, not how the others are placed', () => {
        const view = viewArchitecture({ ...defaultArchitecture(), overrides: { A: 'view' } });
        assert.deepStrictEqual(Object.keys(view).sort(), ['allow', 'builtin', 'forbid', 'layers', 'mode', 'neutral', 'overrides']);
        assert.deepStrictEqual(view.overrides, { A: 'view' });
        assert.deepStrictEqual(view.layers[4], { id: 'utility', label: undefined, description: undefined, color: undefined, icon: undefined, neutral: true });
    });
});

suite('Architecture Schema Test Suite', () => {
    const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../schemas/satori.schema.json'), 'utf8'));
    const layer = schema.properties.architecture.properties.layers.items.properties;

    test('the schema allows the same icons and ids the parser accepts', () => {
        assert.deepStrictEqual(layer.icon.enum, KNOWN_ICONS);
        const id = new RegExp(layer.id.pattern);
        assert.ok(id.test('presentation') && id.test('a-b_1'));
        assert.ok(!id.test('Bad') && !id.test('1x') && !id.test('has space'));
    });

    test('every key of a layer that the parser reads is in the schema', () => {
        ['id', 'label', 'description', 'color', 'icon', 'folders', 'extends', 'names', 'neutral'].forEach(key => assert.ok(layer[key], key));
    });

    test('the schema is registered for satori.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        assert.ok(pkg.contributes.jsonValidation.some((v: any) => v.fileMatch === 'satori.json' && v.url === './schemas/satori.schema.json'));
    });
});

suite('Architecture Folders Discovery Test Suite', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-folders-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });
    const mk = (...parts: string[]) => fs.mkdirSync(path.join(dir, ...parts), { recursive: true });

    test('lists the folders of lib and leaves out hidden ones and files', () => {
        mk('lib', 'views'); mk('lib', 'models'); mk('lib', '.dart_tool');
        fs.writeFileSync(path.join(dir, 'lib', 'main.dart'), '');
        const found = discoverFolders(dir);
        assert.strictEqual(found.base, 'lib');
        assert.deepStrictEqual(found.folders.sort(), ['models', 'views']);
    });

    test('reads inside lib/src when that is all lib has', () => {
        mk('lib', 'src', 'views'); mk('lib', 'src', 'models');
        const found = discoverFolders(dir);
        assert.strictEqual(found.base, 'lib/src');
        assert.deepStrictEqual(found.folders.sort(), ['models', 'views']);
    });

    test('a project without lib has no folders', () => {
        assert.deepStrictEqual(discoverFolders(dir), { base: 'lib', folders: [] });
    });

    test('loading a file with the folders preset reads the project it sits in', () => {
        mk('lib', 'views'); mk('lib', 'services');
        fs.writeFileSync(path.join(dir, 'satori.json'), JSON.stringify({ architecture: { preset: 'folders' } }));
        const loaded = loadArchitecture(dir);
        assert.deepStrictEqual(loaded.problems, []);
        assert.deepStrictEqual(loaded.architecture.layers.map(l => l.id), ['views', 'services', 'core']);
    });
});

suite('Layer Override File Test Suite', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-override-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });
    const file = () => path.join(dir, 'satori.json');
    const read = () => JSON.parse(fs.readFileSync(file(), 'utf8'));

    test('with no file it creates one with the default layers, so nothing else changes', () => {
        fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x');
        const result = writeLayerOverride(dir, 'Product', 'model');
        assert.deepStrictEqual({ ok: result.ok, created: result.created }, { ok: true, created: true });
        assert.deepStrictEqual(read(), { architecture: { preset: 'default', overrides: { Product: 'model' } } });
        const loaded = loadArchitecture(dir);
        assert.deepStrictEqual(loaded.problems, []);
        assert.strictEqual(loaded.architecture.overrides.Product, 'model');
        assert.deepStrictEqual(loaded.architecture.layers.map(l => l.id), ['view', 'state', 'service', 'model', 'utility']);
    });

    test('it goes next to the pubspec.yaml of the project when the analysed folder is below it', () => {
        fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x');
        fs.mkdirSync(path.join(dir, 'lib', 'a'), { recursive: true });
        assert.strictEqual(architectureFileFor(path.join(dir, 'lib', 'a')), file());
    });

    test('with a file it adds the class and keeps everything else', () => {
        fs.writeFileSync(file(), JSON.stringify({ other: 1, architecture: { preset: 'clean', rules: { mode: 'allow' }, overrides: { Old: 'data' } } }));
        writeLayerOverride(dir, 'Product', 'domain');
        assert.deepStrictEqual(read(), { other: 1, architecture: { preset: 'clean', rules: { mode: 'allow' }, overrides: { Old: 'data', Product: 'domain' } } });
    });

    test('a null layer takes the class back to automatic, and the empty list goes away', () => {
        fs.writeFileSync(file(), JSON.stringify({ architecture: { preset: 'clean', overrides: { Product: 'domain' } } }));
        writeLayerOverride(dir, 'Product', null);
        assert.deepStrictEqual(read(), { architecture: { preset: 'clean' } });
    });

    test('a file that is not valid JSON is never overwritten', () => {
        fs.writeFileSync(file(), '{ "architecture": ');
        const result = writeLayerOverride(dir, 'Product', 'domain');
        assert.strictEqual(result.ok, false);
        assert.ok(/not valid JSON/.test(result.problem!));
        assert.strictEqual(fs.readFileSync(file(), 'utf8'), '{ "architecture": ');
    });

    test('a file that holds something else than an object is left alone', () => {
        fs.writeFileSync(file(), '[1, 2]');
        assert.strictEqual(writeLayerOverride(dir, 'Product', 'domain').ok, false);
        assert.strictEqual(fs.readFileSync(file(), 'utf8'), '[1, 2]');
    });

    test('a file with no architecture section gets one and keeps its other keys', () => {
        fs.writeFileSync(file(), JSON.stringify({ other: true }));
        writeLayerOverride(dir, 'A', 'view');
        assert.deepStrictEqual(read(), { other: true, architecture: { preset: 'default', overrides: { A: 'view' } } });
    });

    test('the digest ignores the classes placed by hand but not the rest', () => {
        fs.writeFileSync(file(), JSON.stringify({ architecture: { preset: 'clean' } }));
        const before = architectureDigest(file());
        writeLayerOverride(dir, 'Product', 'domain');
        assert.strictEqual(architectureDigest(file()), before, 'moving a class does not change it');
        fs.writeFileSync(file(), JSON.stringify({ architecture: { preset: 'mvvm' } }));
        assert.notStrictEqual(architectureDigest(file()), before, 'a different architecture does');
        assert.strictEqual(architectureDigest(undefined), '');
    });
});
