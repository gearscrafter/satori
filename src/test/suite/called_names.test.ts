import * as assert from 'assert';
import { CalledNames } from '../../analysis/called_names';
import { escapeRegExp } from '../../core';

suite('Called Names Test Suite', () => {
    const names = ['load', 'save', 'Repo.named', 'build', 'operator ==', 'run', 'x'];
    const index = new CalledNames(names);
    const mentioned = (code: string) => index.mentioned(code).sort();

    test('a call is found, with or without spaces before the parenthesis', () => {
        assert.deepStrictEqual(mentioned('load(); save ();'), ['load', 'save']);
    });

    test('a method called on an object is found by its name', () => {
        assert.deepStrictEqual(mentioned('repo.load(); a.b.save();'), ['load', 'save']);
    });

    test('a named constructor is found whole', () => {
        assert.deepStrictEqual(mentioned('final r = Repo.named(1);'), ['Repo.named']);
    });

    test('a name that is only mentioned, not called, is not found', () => {
        assert.deepStrictEqual(mentioned('final f = load; var save = 1;'), []);
    });

    test('a name inside a longer identifier is not found', () => {
        assert.deepStrictEqual(mentioned('preload(); loader(); reload ();'), []);
    });

    test('a name that is not a plain identifier still works', () => {
        assert.deepStrictEqual(mentioned('bool operator ==(Object o) => true;'), ['operator ==']);
    });

    test('it finds the same names as testing one pattern per name', () => {
        const samples = [
            'final a = load(1); b.save(); x(); await Repo.named(); items.map((e) => build(e)).toList();',
            'if (run ()) { return Repo.named (2); } else { other.run(); }',
            'var s = x; x = 3; loading(); unload (); this.build(context);',
            'a.b.c.load(); (load)(); load\n  (); Repo\n.named();'
        ];
        for (const code of samples) {
            const expected = names.filter(name => new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`).test(code)).sort();
            assert.deepStrictEqual(mentioned(code), expected, code);
        }
    });
});
