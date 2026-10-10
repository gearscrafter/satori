import * as assert from 'assert';
import { providerDeclarations, watchedProviders } from '../../analysis/riverpod';

suite('Riverpod Test Suite', () => {
    const classes = new Set(['UserNotifier', 'UserState', 'UserRepository', 'Counter', 'Todo', 'Cart']);
    const declared = (text: string) => Object.fromEntries(Array.from(providerDeclarations(text, classes)).map(([k, v]) => [k, v.sort()]));

    test('a provider holds the classes its declaration names', () => {
        const text = `final userProvider = StateNotifierProvider<UserNotifier, UserState>((ref) => UserNotifier(ref.read(repoProvider)));`;
        assert.deepStrictEqual(declared(text), { userProvider: ['UserNotifier', 'UserState'] });
    });

    test('a constructor tear-off is the class too', () => {
        assert.deepStrictEqual(declared(`final counterProvider = NotifierProvider<Counter, int>(Counter.new);`), { counterProvider: ['Counter'] });
    });

    test('a provider that holds something that is not a project class holds nothing', () => {
        assert.deepStrictEqual(declared(`final nameProvider = Provider<String>((ref) => 'x');`), { nameProvider: [] });
    });

    test('providers of several kinds and modifiers are found', () => {
        const text = [
            'final a = FutureProvider<List<Todo>>((ref) async => []);',
            'final b = StateProvider.autoDispose<Cart>((ref) => Cart());',
            'final c = ChangeNotifierProvider.family<Cart, int>((ref, id) => Cart());',
            'const d = Provider((ref) => UserRepository());'
        ].join('\n');
        assert.deepStrictEqual(declared(text), { a: ['Todo'], b: ['Cart'], c: ['Cart'], d: ['UserRepository'] });
    });

    test('with the code generator, the class and the function give their provider', () => {
        const text = `import 'package:riverpod_annotation/riverpod_annotation.dart';\n@riverpod\nclass Counter extends _$Counter {}\n@riverpod\nFuture<List<Todo>> todos(TodosRef ref) async => [];\n@Riverpod(keepAlive: true)\nclass UserNotifier extends _$UserNotifier {}`;
        assert.deepStrictEqual(declared(text), { counterProvider: ['Counter'], todosProvider: ['Todo'], userNotifierProvider: ['UserNotifier'] });
    });

    test('the type of the provider is not something it holds, even when the project has a class of that name', () => {
        const named = new Set([...classes, 'StateNotifierProvider']);
        const text = 'final p = StateNotifierProvider<UserNotifier, UserState>((ref) => UserNotifier());';
        assert.deepStrictEqual(Array.from(providerDeclarations(text, named).get('p')!).sort(), ['UserNotifier', 'UserState']);
    });

    test('a file with no provider gives none', () => {
        assert.deepStrictEqual(declared(`class A { final x = Cart(); }`), {});
    });

    test('a call that only looks like a declaration is not one', () => {
        assert.deepStrictEqual(declared(`void f() { final x = computeProvider(1); }`), {});
    });

    test('the providers a piece of code reads, whatever it does with them', () => {
        const code = `final a = ref.watch(userProvider); ref.read(cartProvider.notifier).add(1); ref.listen(todosProvider(3), (p, n) {}); ref.invalidate(counterProvider); ref.refresh(userProvider.future);`;
        assert.deepStrictEqual(watchedProviders(code).sort(), ['cartProvider', 'counterProvider', 'todosProvider', 'userProvider']);
    });

    test('a read that is not through ref is not Riverpod', () => {
        assert.deepStrictEqual(watchedProviders(`context.read<Cart>(); store.watch(x); watch(y);`), []);
    });

    test('widgetRef and a container are read the same way', () => {
        assert.deepStrictEqual(watchedProviders(`widgetRef.watch(aProvider); container.read(bProvider);`).sort(), ['aProvider', 'bProvider']);
    });
});
