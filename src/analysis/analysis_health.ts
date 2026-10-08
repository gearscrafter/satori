/**
 * Tells whether an analysis found what a project has, and, when it did not, what the likely reasons are.
 *
 * The usual reason is that Dart's language server was still starting and answered "no symbols" for most files. An
 * analysis like that must not be saved: reopening the project would show the same empty diagram until a file changed.
 */

export interface SymbolStats {
    /** Dart files that were asked about. */
    files: number;
    /** Files whose answer had at least one symbol. */
    withSymbols: number;
    /** Files whose request failed. */
    errors: number;
}

export interface AnalysisStats extends SymbolStats {
    /** Classes in the finished graph. */
    classes: number;
}

/** The share of files that must have declared something for the result to be believed. Barrel files and parts have nothing. */
export const MIN_SHARE_WITH_SYMBOLS = 0.5;

/** Symbols were read for enough of the files: used before the graph exists. */
export function symbolsLookComplete(stats: SymbolStats): boolean {
    return stats.files > 0 && stats.withSymbols / stats.files >= MIN_SHARE_WITH_SYMBOLS;
}

/** The finished analysis is worth showing as final, and worth saving. */
export function isHealthy(stats: AnalysisStats): boolean {
    return stats.classes > 0 && symbolsLookComplete(stats);
}

export interface ProjectFacts {
    files: number;
    withSymbols: number;
    isProjectRoot: boolean;
    hasPackageConfig: boolean;
    dartExtensionActive: boolean;
    workspaceTrusted: boolean;
    /** Files Satori itself left out (satori.analysis.exclude). */
    leftOutBySatori: number;
}

export type CauseId = 'untrusted' | 'dartInactive' | 'noPubspec' | 'noPackageConfig' | 'leftOut' | 'warming';

export interface Cause {
    id: CauseId;
    /** Values for the message of the cause. */
    args: string[];
}

/** The reasons that fit what is known, most likely first. "Still starting" is last because it is always possible. */
export function likelyCauses(facts: ProjectFacts): Cause[] {
    const causes: Cause[] = [];
    if (!facts.workspaceTrusted) { causes.push({ id: 'untrusted', args: [] }); }
    if (!facts.dartExtensionActive) { causes.push({ id: 'dartInactive', args: [] }); }
    if (!facts.isProjectRoot) { causes.push({ id: 'noPubspec', args: [] }); }
    else if (!facts.hasPackageConfig) { causes.push({ id: 'noPackageConfig', args: [] }); }
    if (facts.leftOutBySatori > 0) { causes.push({ id: 'leftOut', args: [String(facts.leftOutBySatori)] }); }
    causes.push({ id: 'warming', args: [] });
    return causes;
}
