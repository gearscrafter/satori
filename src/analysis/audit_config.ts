/** Thresholds and weights of the architecture audit, as the webview model expects them. */
export interface AuditConfig {
    godWmc: number;
    godAtfd: number;
    godTcc: number;
    weights: { coupling: number; size: number; cycles: number; violations: number };
}

/**
 * Defaults follow the God Class detection strategy of Lanza and Marinescu, "Object-Oriented Metrics in Practice":
 * a class is a God Class when it uses more than a few foreign attributes (ATFD > 5), is very complex (WMC >= 47)
 * and has little cohesion (TCC < 1/3). The risk weights are Satori's own choice.
 */
export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
    godWmc: 47,
    godAtfd: 5,
    godTcc: 0.33,
    weights: { coupling: 0.3, size: 0.15, cycles: 0.25, violations: 0.3 }
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Builds the audit settings from `satori.audit.*`, ignoring values that are missing, not numbers or out of range. */
export function readAuditConfig(get: (key: string) => unknown): AuditConfig {
    const d = DEFAULT_AUDIT_CONFIG;
    return {
        godWmc: bounded(get('audit.godClass.wmc'), d.godWmc, 1, 100000),
        godAtfd: bounded(get('audit.godClass.atfd'), d.godAtfd, 0, 100000),
        godTcc: bounded(get('audit.godClass.tcc'), d.godTcc, 0, 1),
        weights: {
            coupling: bounded(get('audit.weights.coupling'), d.weights.coupling, 0, 1),
            size: bounded(get('audit.weights.size'), d.weights.size, 0, 1),
            cycles: bounded(get('audit.weights.cycles'), d.weights.cycles, 0, 1),
            violations: bounded(get('audit.weights.violations'), d.weights.violations, 0, 1)
        }
    };
}
