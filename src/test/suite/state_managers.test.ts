import * as assert from 'assert';
import { detectStateManager } from '../../analysis/state_managers';
import { observedTypeNames } from '../../analysis/observers';

suite('State Managers Test Suite', () => {
    test('recognises Bloc and Cubit, with their generics', () => {
        assert.deepStrictEqual(detectStateManager({ extends: ['Cubit<int>'] }), { family: 'bloc', base: 'Cubit' });
        assert.deepStrictEqual(detectStateManager({ extends: [{ name: 'Bloc<CartEvent, CartState>' }] }), { family: 'bloc', base: 'Bloc' });
        assert.strictEqual(detectStateManager({ extends: ['HydratedCubit<String>'] })?.family, 'bloc');
    });

    test('recognises ChangeNotifier whether it is extended or mixed in', () => {
        assert.strictEqual(detectStateManager({ extends: ['ChangeNotifier'] })?.family, 'provider');
        assert.deepStrictEqual(detectStateManager({ with: ['ChangeNotifier'] }), { family: 'provider', base: 'ChangeNotifier' });
    });

    test('recognises Riverpod notifiers and GetX controllers', () => {
        assert.strictEqual(detectStateManager({ extends: ['StateNotifier<List<String>>'] })?.family, 'riverpod');
        assert.strictEqual(detectStateManager({ extends: ['AsyncNotifier<User>'] })?.family, 'riverpod');
        assert.strictEqual(detectStateManager({ extends: ['GetxController'] })?.family, 'getx');
    });

    test('ignores classes that extend something else and does not guess from the name', () => {
        assert.strictEqual(detectStateManager({ extends: ['Entity'] }), undefined);
        assert.strictEqual(detectStateManager(undefined), undefined);
        assert.strictEqual(detectStateManager({}), undefined);
    });

    test('what a class extends wins over what it mixes in', () => {
        assert.strictEqual(detectStateManager({ extends: ['Cubit<int>'], with: ['ChangeNotifier'] })?.family, 'bloc');
    });
});

suite('Observers Test Suite', () => {
    test('finds the holder named by the builder widgets', () => {
        assert.deepStrictEqual(observedTypeNames('final w = BlocBuilder<CounterCubit, int>(builder: b);'), ['CounterCubit']);
        assert.deepStrictEqual(observedTypeNames('Consumer<Session>(builder: b); Selector<Cart, int>(selector: s);').sort(), ['Cart', 'Session']);
    });

    test('finds context.read, watch and select', () => {
        assert.deepStrictEqual(observedTypeNames('final a = context.read<Session>(); final b = context.watch<Cart>(); context.select<Cart, int>((c) => 1);').sort(), ['Cart', 'Session']);
    });

    test('finds Provider.of, BlocProvider.of and Get.find', () => {
        assert.deepStrictEqual(observedTypeNames('Provider.of<Cart>(context); BlocProvider.of<CounterCubit>(context); Get.find<Profile>();').sort(), ['Cart', 'CounterCubit', 'Profile']);
    });

    test('reports each holder once and ignores ordinary generics', () => {
        assert.deepStrictEqual(observedTypeNames('context.read<Cart>(); context.watch<Cart>();'), ['Cart']);
        assert.deepStrictEqual(observedTypeNames('final xs = List<Cart>(); final m = Map<String, Cart>();'), []);
    });

    test('code that listens to nothing gives nothing', () => {
        assert.deepStrictEqual(observedTypeNames('void run() { go(); }'), []);
    });
});
