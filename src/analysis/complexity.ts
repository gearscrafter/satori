/**
 * McCabe cyclomatic complexity of one method, estimated from its source: one path plus one for every decision
 * point. It expects comment-free, string-free text (see stripCommentsAndStrings) so words inside strings do not count.
 *
 * Decision points: if, for, while (also closes do-while), case, catch, `&&`, `||`, `??` and the ternary `?`.
 * The ternary is told apart from a nullable type (`String? name`) by the space before it, which is how the
 * language is formatted by `dart format`.
 */
export function cyclomaticComplexity(source: string): number {
    const keywords = source.match(/\b(?:if|for|while|case|catch)\b/g)?.length ?? 0;
    const logical = source.match(/&&|\|\|/g)?.length ?? 0;
    const coalesce = source.match(/\?\?/g)?.length ?? 0;
    // A lone "?" after a space that is not "?." / "?[" / "??": `a ? b : c`.
    const ternary = source.match(/\s\?(?![?.\[])/g)?.length ?? 0;
    return 1 + keywords + logical + coalesce + ternary;
}
