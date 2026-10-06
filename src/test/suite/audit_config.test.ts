import * as assert from 'assert';
import { readAuditConfig, DEFAULT_AUDIT_CONFIG } from '../../analysis/audit_config';

suite('Audit Config Test Suite', () => {
    test('uses the God Class thresholds of Lanza and Marinescu by default', () => {
        const cfg = readAuditConfig(() => undefined);
        assert.strictEqual(cfg.godWmc, 47);
        assert.strictEqual(cfg.godAtfd, 5);
        assert.strictEqual(cfg.godTcc, 0.33);
        assert.deepStrictEqual(cfg, DEFAULT_AUDIT_CONFIG);
    });

    test('takes the values the user set', () => {
        const values: Record<string, unknown> = { 'audit.godClass.wmc': 30, 'audit.weights.cycles': 0.5 };
        const cfg = readAuditConfig(key => values[key]);
        assert.strictEqual(cfg.godWmc, 30);
        assert.strictEqual(cfg.weights.cycles, 0.5);
        assert.strictEqual(cfg.godAtfd, 5);
    });

    test('ignores values that are not numbers and keeps the rest in range', () => {
        const values: Record<string, unknown> = { 'audit.godClass.wmc': 'many', 'audit.godClass.tcc': 4, 'audit.godClass.atfd': -3, 'audit.weights.size': NaN };
        const cfg = readAuditConfig(key => values[key]);
        assert.strictEqual(cfg.godWmc, 47);
        assert.strictEqual(cfg.godTcc, 1);
        assert.strictEqual(cfg.godAtfd, 0);
        assert.strictEqual(cfg.weights.size, 0.15);
    });
});
