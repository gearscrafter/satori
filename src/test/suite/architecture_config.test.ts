import * as assert from 'assert';
import { defaultArchitecture, layerFor, parseArchitecture, Architecture } from '../../analysis/architecture_config';

const clean = JSON.stringify({
    architecture: {
        layers: [
            { id: 'presentation', label: 'Presentation', folders: ['lib/presentation/**'], names: ['*Page', '*Screen'], extends: ['StatelessWidget'] },
            { id: 'domain', folders: ['lib/domain/**'], names: ['*UseCase'] },
            { id: 'data', folders: ['lib/data/**'], names: ['*Repository', '*Dto'] },
            { id: 'core', neutral: true, folders: ['lib/core/**'] }
        ],
        rules: { mode: 'allow', allow: [['presentation', 'domain'], ['data', 'domain']] }
    }
});

const facts = (name: string, path = 'lib/x.dart', parents: string[] = [], guess = 'utility') => ({ name, path, parents, guess });

suite('Architecture Config Test Suite', () => {
    test('without a file the four layers of always are used', () => {
        const { architecture, problems } = parseArchitecture(undefined);
        assert.deepStrictEqual(problems, []);
        assert.strictEqual(architecture.builtin, true);
        assert.deepStrictEqual(architecture.layers.map(l => l.id), ['view', 'state', 'service', 'model', 'utility']);
        assert.strictEqual(architecture.neutral, 'utility');
        assert.strictEqual(architecture.mode, 'order');
    });

    test('a file without an architecture section keeps the defaults', () => {
        assert.strictEqual(parseArchitecture('{"other": 1}').architecture.builtin, true);
        assert.strictEqual(parseArchitecture('   ').architecture.builtin, true);
    });

    test('reads a clean architecture with its rules', () => {
        const { architecture, problems } = parseArchitecture(clean);
        assert.deepStrictEqual(problems, []);
        assert.deepStrictEqual(architecture.layers.map(l => l.id), ['presentation', 'domain', 'data', 'core']);
        assert.strictEqual(architecture.mode, 'allow');
        assert.deepStrictEqual(architecture.allow, [['presentation', 'domain'], ['data', 'domain']]);
        assert.strictEqual(architecture.neutral, 'core');
        assert.strictEqual(architecture.builtin, false);
    });

    test('adds a neutral layer when none is marked', () => {
        const { architecture } = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'ui' }, { id: 'logic' }] } }));
        assert.strictEqual(architecture.neutral, 'other');
        assert.deepStrictEqual(architecture.layers.map(l => l.id), ['ui', 'logic', 'other']);
    });

    test('only one layer can be neutral', () => {
        const { architecture } = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'a', neutral: true }, { id: 'b', neutral: true }] } }));
        assert.strictEqual(architecture.neutral, 'a');
        assert.strictEqual(architecture.layers.find(l => l.id === 'b')!.neutral, undefined);
    });

    test('invalid JSON falls back to the defaults and says why', () => {
        const { architecture, problems } = parseArchitecture('{ "architecture": ');
        assert.strictEqual(architecture.builtin, true);
        assert.ok(/not valid JSON/.test(problems[0]), problems[0]);
    });

    test('a bad layer is left out and reported, the rest still works', () => {
        const { architecture, problems } = parseArchitecture(JSON.stringify({
            architecture: { layers: [{ id: 'Bad Id' }, { id: 'ok', color: 'red' }, { id: 'ok' }, { id: 'fine', icon: 'nope' }] }
        }));
        assert.deepStrictEqual(architecture.layers.map(l => l.id), ['ok', 'fine', 'other']);
        assert.strictEqual(problems.length, 4, problems.join(' | '));
        assert.strictEqual(architecture.layers[0].color, undefined);
    });

    test('rules, overrides and the guess must name layers that exist', () => {
        const { architecture, problems } = parseArchitecture(JSON.stringify({
            architecture: {
                layers: [{ id: 'a' }, { id: 'b' }],
                rules: { mode: 'sideways', allow: [['a', 'b'], ['a', 'zzz'], 'bad'], forbid: [['b', 'a']] },
                overrides: { Foo: 'a', Bar: 'nope' },
                heuristic: { view: 'a', state: 'ghost', gizmo: 'a' }
            }
        }));
        assert.strictEqual(architecture.mode, 'order');
        assert.deepStrictEqual(architecture.allow, [['a', 'b']]);
        assert.deepStrictEqual(architecture.forbid, [['b', 'a']]);
        assert.deepStrictEqual(architecture.overrides, { Foo: 'a' });
        assert.deepStrictEqual(architecture.heuristic, { view: 'a' });
        assert.strictEqual(problems.length, 6, problems.join(' | '));
    });

    test('with no map for the guess, the layers that carry its names keep using it', () => {
        const { architecture } = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'view' }, { id: 'model' }, { id: 'extra' }] } }));
        assert.deepStrictEqual(architecture.heuristic, { view: 'view', model: 'model' });
    });

    test('the guess can be switched off', () => {
        const { architecture } = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'a' }], heuristic: false } }));
        assert.deepStrictEqual(architecture.heuristic, {});
    });
});

suite('Layer Placement Test Suite', () => {
    const arch = (): Architecture => parseArchitecture(clean).architecture;

    test('the folder of a file decides first', () => {
        assert.strictEqual(layerFor(arch(), facts('UserPage', 'lib/data/user_page.dart')), 'data');
        assert.strictEqual(layerFor(arch(), facts('Anything', 'lib/domain/entities/user.dart')), 'domain');
    });

    test('then what the class extends, then its name', () => {
        assert.strictEqual(layerFor(arch(), facts('Header', 'lib/misc/h.dart', ['StatelessWidget'])), 'presentation');
        assert.strictEqual(layerFor(arch(), facts('LoginUseCase', 'lib/misc/l.dart')), 'domain');
        assert.strictEqual(layerFor(arch(), facts('UserRepository', 'lib/misc/r.dart')), 'data');
    });

    test('a folder wins over an extends and a name', () => {
        assert.strictEqual(layerFor(arch(), facts('SomePage', 'lib/data/p.dart', ['StatelessWidget'])), 'data');
    });

    test('what matches nothing goes to the neutral layer', () => {
        assert.strictEqual(layerFor(arch(), facts('Whatever', 'lib/misc/w.dart')), 'core');
    });

    test('a class placed by hand beats every rule', () => {
        const a = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'a', folders: ['lib/a/**'] }, { id: 'b' }], overrides: { Moved: 'b' } } })).architecture;
        assert.strictEqual(layerFor(a, facts('Moved', 'lib/a/m.dart')), 'b');
    });

    test('Satori\'s own guess is used when the architecture keeps it', () => {
        const a = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'ui' }, { id: 'logic' }], heuristic: { view: 'ui', state: 'ui', service: 'logic', model: 'logic' } } })).architecture;
        assert.strictEqual(layerFor(a, facts('Thing', 'lib/t.dart', [], 'view')), 'ui');
        assert.strictEqual(layerFor(a, facts('Thing', 'lib/t.dart', [], 'service')), 'logic');
        assert.strictEqual(layerFor(a, facts('Thing', 'lib/t.dart', [], 'utility')), 'other');
    });

    test('the default architecture places a class by the guess alone', () => {
        const d = defaultArchitecture();
        assert.strictEqual(layerFor(d, facts('X', 'lib/x.dart', [], 'service')), 'service');
        assert.strictEqual(layerFor(d, facts('X', 'lib/x.dart', [], 'utility')), 'utility');
    });

    test('name patterns: * at the start, the end or both', () => {
        const a = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'x', names: ['Base*', '*Impl', '*Mid*'] }] } })).architecture;
        assert.strictEqual(layerFor(a, facts('BaseThing')), 'x');
        assert.strictEqual(layerFor(a, facts('ThingImpl')), 'x');
        assert.strictEqual(layerFor(a, facts('AMidB')), 'x');
        assert.strictEqual(layerFor(a, facts('Other')), 'other');
        assert.strictEqual(layerFor(a, facts('ImplThing')), 'other');
    });

    test('Windows separators in the path do not matter', () => {
        assert.strictEqual(layerFor(arch(), facts('A', 'lib\\data\\a.dart')), 'data');
    });
});

suite('Architecture Preset Test Suite', () => {
    const preset = (name: string, extra: any = {}) => parseArchitecture(JSON.stringify({ architecture: { preset: name, ...extra } }));

    test('a preset alone is a complete architecture', () => {
        const clean = preset('clean');
        assert.deepStrictEqual(clean.problems, []);
        assert.deepStrictEqual(clean.architecture.layers.map(l => l.id), ['presentation', 'domain', 'data', 'core']);
        assert.strictEqual(clean.architecture.mode, 'allow');
        assert.deepStrictEqual(clean.architecture.allow, [['presentation', 'domain'], ['data', 'domain']]);
        assert.strictEqual(clean.architecture.neutral, 'core');

        const mvvm = preset('mvvm');
        assert.deepStrictEqual(mvvm.problems, []);
        assert.deepStrictEqual(mvvm.architecture.layers.map(l => l.id), ['view', 'viewmodel', 'model', 'core']);
        assert.strictEqual(mvvm.architecture.mode, 'order');
    });

    test('the default preset is the four layers of always', () => {
        const d = preset('default');
        assert.deepStrictEqual(d.problems, []);
        assert.deepStrictEqual(d.architecture.layers.map(l => l.id), ['view', 'state', 'service', 'model', 'utility']);
        assert.strictEqual(d.architecture.neutral, 'utility');
    });

    test('folders match at any depth: lib/src, a folder per feature, a monorepo', () => {
        const a = preset('clean').architecture;
        const where = (p: string) => layerFor(a, facts('Thing', p));
        assert.strictEqual(where('lib/presentation/home.dart'), 'presentation');
        assert.strictEqual(where('lib/src/presentation/home.dart'), 'presentation');
        assert.strictEqual(where('lib/features/login/presentation/pages/login.dart'), 'presentation');
        assert.strictEqual(where('packages/auth/lib/src/data/repositories/auth_repo.dart'), 'data');
        assert.strictEqual(where('lib/domain/repositories/user_repository.dart'), 'domain');
        assert.strictEqual(where('lib/core/network/client.dart'), 'core');
    });

    test('in the clean preset the domain is checked before the data layer, so a repository interface stays in the domain', () => {
        const a = preset('clean').architecture;
        assert.strictEqual(layerFor(a, facts('UserRepository', 'lib/domain/repositories/user_repository.dart')), 'domain');
        assert.strictEqual(layerFor(a, facts('UserRepositoryImpl', 'lib/data/repositories/user_repository_impl.dart')), 'data');
    });

    test('classes outside every folder are placed by name and by Satori\'s own guess', () => {
        const a = preset('clean').architecture;
        assert.strictEqual(layerFor(a, facts('LoginUseCase', 'lib/x.dart')), 'domain');
        assert.strictEqual(layerFor(a, facts('Anything', 'lib/x.dart', [], 'service')), 'data');
        assert.strictEqual(layerFor(a, facts('Anything', 'lib/x.dart', [], 'model')), 'domain');
        assert.strictEqual(layerFor(a, facts('Anything', 'lib/x.dart', [], 'view')), 'presentation');
        assert.strictEqual(layerFor(a, facts('Anything', 'lib/x.dart', [], 'utility')), 'core');
    });

    test('mvvm places widgets, view models and models', () => {
        const a = preset('mvvm').architecture;
        assert.strictEqual(layerFor(a, facts('Header', 'lib/x.dart', ['StatelessWidget'])), 'view');
        assert.strictEqual(layerFor(a, facts('CartViewModel', 'lib/x.dart')), 'viewmodel');
        assert.strictEqual(layerFor(a, facts('Thing', 'lib/blocs/thing.dart')), 'viewmodel');
        assert.strictEqual(layerFor(a, facts('Thing', 'lib/services/thing.dart')), 'model');
    });

    test('what the file adds is merged into the preset', () => {
        const merged = preset('clean', {
            layers: [{ id: 'domain', folders: ['lib/business/**'], label: 'Business' }, { id: 'infra', folders: ['lib/infra/**'] }],
            rules: { allow: [['presentation', 'domain'], ['infra', 'domain']] }
        });
        assert.deepStrictEqual(merged.problems, []);
        const a = merged.architecture;
        assert.deepStrictEqual(a.layers.map(l => l.id), ['presentation', 'domain', 'data', 'infra', 'core']);
        assert.strictEqual(a.layers.find(l => l.id === 'domain')!.label, 'Business');
        assert.ok(a.layers.find(l => l.id === 'domain')!.folders!.includes('lib/business/**'), 'its own folder is added');
        assert.ok(a.layers.find(l => l.id === 'domain')!.folders!.includes('**/domain/**'), 'the one of the preset stays');
        assert.deepStrictEqual(a.allow, [['presentation', 'domain'], ['infra', 'domain']]);
        assert.strictEqual(a.mode, 'allow', 'the mode of the preset stays when the file does not say');
        assert.strictEqual(layerFor(a, facts('X', 'lib/infra/x.dart')), 'infra');
    });

    test('overrides still beat everything, with a preset', () => {
        const a = preset('clean', { overrides: { Odd: 'core' } }).architecture;
        assert.strictEqual(layerFor(a, facts('Odd', 'lib/presentation/odd.dart')), 'core');
    });

    test('an unknown preset is reported and, with no layers, falls back to the default', () => {
        const r = preset('hexagonal');
        assert.strictEqual(r.architecture.builtin, true);
        assert.ok(r.problems.some(p => /preset/.test(p)), r.problems.join(' | '));
        const withLayers = preset('hexagonal', { layers: [{ id: 'a' }] });
        assert.strictEqual(withLayers.architecture.builtin, false);
        assert.ok(withLayers.problems.some(p => /preset/.test(p)));
    });

    test('a file with only layers still works as before', () => {
        assert.deepStrictEqual(parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'a' }] } })).problems, []);
    });
});

suite('Architecture Folders Preset Test Suite', () => {
    const run = (folders: string[], extra: any = {}, base = 'lib') => parseArchitecture(
        JSON.stringify({ architecture: { preset: 'folders', ...extra } }),
        { discoverFolders: () => ({ base, folders }) }
    );
    const ids = (r: ReturnType<typeof run>) => r.architecture.layers.map(l => l.id);

    test('one layer per folder, ordered from the screens down to the data', () => {
        const r = run(['models', 'services', 'views', 'state', 'utils', 'widgets']);
        assert.deepStrictEqual(r.problems, []);
        assert.deepStrictEqual(ids(r), ['views', 'widgets', 'state', 'services', 'models', 'core']);
        assert.strictEqual(r.architecture.neutral, 'core');
    });

    test('the layers are called after the folder and made of exactly that folder', () => {
        const a = run(['view_models', 'views']).architecture;
        assert.strictEqual(a.layers.find(l => l.id === 'view_models')!.label, 'View models');
        assert.deepStrictEqual(a.layers.find(l => l.id === 'views')!.folders, ['lib/views/**']);
    });

    test('shared folders go together into the neutral layer', () => {
        const a = run(['views', 'core', 'utils', 'theme']).architecture;
        assert.deepStrictEqual(a.layers.map(l => l.id), ['views', 'core']);
        assert.deepStrictEqual(a.layers.find(l => l.id === 'core')!.folders, ['lib/core/**', 'lib/theme/**', 'lib/utils/**']);
    });

    test('unknown folders come after the known ones, in alphabetical order', () => {
        assert.deepStrictEqual(ids(run(['zeta', 'views', 'alpha', 'models'])), ['views', 'alpha', 'zeta', 'models', 'core']);
    });

    test('classes are placed by the folder they are in, and nothing else is a layer', () => {
        const a = run(['views', 'state', 'services', 'models', 'utils']).architecture;
        const where = (p: string) => layerFor(a, facts('Thing', p));
        assert.strictEqual(where('lib/views/home.dart'), 'views');
        assert.strictEqual(where('lib/services/api/client.dart'), 'services');
        assert.strictEqual(where('lib/utils/format.dart'), 'core');
        assert.strictEqual(where('lib/main.dart'), 'core');
        assert.strictEqual(where('lib/data/other.dart'), 'core');
    });

    test('a package with lib/src reads the folders inside src', () => {
        const a = run(['views', 'models'], {}, 'lib/src').architecture;
        assert.deepStrictEqual(a.layers[0].folders, ['lib/src/views/**']);
        assert.strictEqual(layerFor(a, facts('X', 'lib/src/views/x.dart')), 'views');
    });

    test('no rule is applied until the file asks for one', () => {
        assert.strictEqual(run(['views', 'models']).architecture.mode, 'none');
        assert.strictEqual(run(['views', 'models'], { rules: { mode: 'order' } }).architecture.mode, 'order');
    });

    test('folder names that cannot be an id are cleaned and never repeat', () => {
        const r = run(['My Views', '2fast', 'views', 'Views']);
        assert.deepStrictEqual(r.problems, []);
        const found = ids(r);
        assert.strictEqual(new Set(found).size, found.length, found.join(','));
        assert.ok(found.every(id => /^[a-z][a-z0-9_-]*$/.test(id)), found.join(','));
    });

    test('a huge number of folders is capped, the rest go to the neutral layer', () => {
        const many = Array.from({ length: 30 }, (_, i) => 'folder' + String(i).padStart(2, '0'));
        const a = run(many).architecture;
        assert.strictEqual(a.layers.length, 13);
        assert.strictEqual(layerFor(a, facts('X', 'lib/folder29/x.dart')), 'core');
    });

    test('with no folders it says so and falls back to the default layers', () => {
        const r = run([]);
        assert.strictEqual(r.architecture.builtin, true);
        assert.ok(r.problems.some(p => /folders/.test(p)));
    });

    test('what the file adds is merged into the layers read from the folders', () => {
        const a = run(['views', 'models'], { layers: [{ id: 'models', label: 'Domain models', names: ['*Entity'] }] }).architecture;
        assert.strictEqual(a.layers.find(l => l.id === 'models')!.label, 'Domain models');
        assert.strictEqual(layerFor(a, facts('UserEntity', 'lib/other/x.dart')), 'models');
    });

    test('the mode none is accepted by itself', () => {
        const a = parseArchitecture(JSON.stringify({ architecture: { layers: [{ id: 'a' }, { id: 'b' }], rules: { mode: 'none' } } })).architecture;
        assert.strictEqual(a.mode, 'none');
    });
});
