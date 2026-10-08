import * as assert from 'assert';
import { isHealthy, likelyCauses, symbolsLookComplete, ProjectFacts } from '../../analysis/analysis_health';

suite('Analysis Health Test Suite', () => {
    test('an analysis with symbols for most files is believed', () => {
        assert.strictEqual(symbolsLookComplete({ files: 100, withSymbols: 90, errors: 0 }), true);
        assert.strictEqual(symbolsLookComplete({ files: 100, withSymbols: 50, errors: 0 }), true);
    });

    test('an analysis where most files answered nothing is not', () => {
        assert.strictEqual(symbolsLookComplete({ files: 100, withSymbols: 49, errors: 0 }), false);
        assert.strictEqual(symbolsLookComplete({ files: 100, withSymbols: 0, errors: 0 }), false);
        assert.strictEqual(symbolsLookComplete({ files: 0, withSymbols: 0, errors: 0 }), false);
    });

    test('a graph without classes is never healthy', () => {
        assert.strictEqual(isHealthy({ files: 10, withSymbols: 10, errors: 0, classes: 0 }), false);
        assert.strictEqual(isHealthy({ files: 10, withSymbols: 10, errors: 0, classes: 7 }), true);
        assert.strictEqual(isHealthy({ files: 10, withSymbols: 2, errors: 0, classes: 7 }), false);
    });

    const facts = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
        files: 50, withSymbols: 0, isProjectRoot: true, hasPackageConfig: true, dartExtensionActive: true,
        workspaceTrusted: true, leftOutBySatori: 0, ...over
    });

    test('when nothing is wrong with the setup the server still starting is the only suspect', () => {
        assert.deepStrictEqual(likelyCauses(facts()).map(c => c.id), ['warming']);
    });

    test('each thing that is wrong adds its own reason, and "still starting" stays last', () => {
        const ids = likelyCauses(facts({
            workspaceTrusted: false, dartExtensionActive: false, hasPackageConfig: false, leftOutBySatori: 12
        })).map(c => c.id);
        assert.deepStrictEqual(ids, ['untrusted', 'dartInactive', 'noPackageConfig', 'leftOut', 'warming']);
    });

    test('a folder without a pubspec is reported instead of a missing package config', () => {
        const ids = likelyCauses(facts({ isProjectRoot: false, hasPackageConfig: false })).map(c => c.id);
        assert.deepStrictEqual(ids, ['noPubspec', 'warming']);
    });

    test('the reasons carry what is needed to explain them', () => {
        const causes = likelyCauses(facts({ leftOutBySatori: 3 }));
        assert.deepStrictEqual(causes.find(c => c.id === 'leftOut')!.args, ['3']);
    });
});
