import * as assert from 'assert';
import { declarationFrom, typeUsage, unambiguousClassNames } from '../../analysis/type_usage';

suite('Unambiguous Class Names Test Suite', () => {
    test('a name used by two classes is left out, whatever the order', () => {
        assert.deepStrictEqual(Array.from(unambiguousClassNames(['A', 'B', 'A', 'C'])).sort(), ['B', 'C']);
        assert.deepStrictEqual(Array.from(unambiguousClassNames(['A', 'A', 'A'])), []);
        assert.deepStrictEqual(Array.from(unambiguousClassNames([])), []);
    });
});

suite('Field Declaration Test Suite', () => {
    test('it reads the type written before the name, up to the semicolon', () => {
        const lines = ['class A {', '  final Repo repo;', '  int other = 0;', '}'];
        assert.strictEqual(declarationFrom(lines, 1), '  final Repo repo;');
    });

    test('a declaration over several lines is read whole', () => {
        const lines = ['  final Map<String,', '      Cart> carts =', '      {};', '  int x;'];
        assert.strictEqual(declarationFrom(lines, 0), '  final Map<String,\n      Cart> carts =\n      {};');
    });

    test('it stops after a few lines when there is no semicolon', () => {
        const lines = Array.from({ length: 30 }, (_, i) => 'line' + i);
        assert.strictEqual(declarationFrom(lines, 0, 3).split('\n').length, 3);
    });

    test('the end of the file ends it', () => {
        assert.strictEqual(declarationFrom(['a', 'b'], 1), 'b');
        assert.strictEqual(declarationFrom(['a'], 5), '');
    });
});

suite('Type Usage Test Suite', () => {
    const classes = new Set(['Repo', 'Cart', 'Api', 'Session']);
    const run = (source: string, own?: string) => {
        const usage = typeUsage(source, classes, own);
        return { created: usage.created.sort(), used: usage.used.sort() };
    };

    test('a typed field uses the class', () => {
        assert.deepStrictEqual(run('final Repo repo;'), { created: [], used: ['Repo'] });
    });

    test('generic arguments count, however deep', () => {
        assert.deepStrictEqual(run('final Map<String, List<Cart>> carts = {};'), { created: [], used: ['Cart'] });
    });

    test('parameters and return types count', () => {
        assert.deepStrictEqual(run('Future<Repo> load(Api api, int id) async { return api.get(id); }'), { created: [], used: ['Api', 'Repo'] });
    });

    test('a call to the class name creates it, with or without const, new or type arguments', () => {
        assert.deepStrictEqual(run('final a = Repo(); final b = const Cart(); final c = new Api<int>();'), { created: ['Api', 'Cart', 'Repo'], used: [] });
    });

    test('a class that is injected shows up through its type argument', () => {
        assert.deepStrictEqual(run('final repo = getIt<Repo>(); final s = context.read<Session>();'), { created: [], used: ['Repo', 'Session'] });
    });

    test('casts and checks use the class', () => {
        assert.deepStrictEqual(run('if (x is Cart) { (x as Repo).run(); }'), { created: [], used: ['Cart', 'Repo'] });
    });

    test('a static member is not a type use: it is a call', () => {
        assert.deepStrictEqual(run('Repo.load(); final x = Cart.empty;'), { created: [], used: [] });
    });

    test('a name that is not a class of the project is ignored', () => {
        assert.deepStrictEqual(run('final Other other = Other(); List<String> names;'), { created: [], used: [] });
    });

    test('a member of a class does not depend on its own class', () => {
        assert.deepStrictEqual(run('Repo copy(Repo other) => Repo();', 'Repo'), { created: [], used: [] });
    });

    test('a prefixed or member name is not the class', () => {
        assert.deepStrictEqual(run('final x = other.Repo; final y = prefix.Cart();'), { created: [], used: [] });
    });

    test('the same class twice is reported once', () => {
        assert.deepStrictEqual(run('Repo a; Repo b; Repo c = Repo(); Repo d = Repo();'), { created: ['Repo'], used: ['Repo'] });
    });

    test('a comparison is not a generic list', () => {
        assert.deepStrictEqual(run('final ok = a < Cart.limit && b > 1;'), { created: [], used: [] });
    });
});
