import { KIND_FIELD, KIND_PROPERTY, KIND_METHOD, KIND_FUNCTION, escapeRegExp } from "../../core";
import { EnrichedSymbol, EnrichmentDependencies } from "../../types/index";
import { log } from "../../utils/logger";

/**
 * Enriches symbols using regex analysis of source code as fallback.
 * Extracts field types and method return types when other techniques
 * fail, analyzing code snippets around the symbol declaration.
 * 
 * @param enrichedSym - Symbol to enrich with type information
 * @param logPrefix - Prefix for logging with indentation
 * @param dependencies - Dependencies including source file content
 */
export function enrichWithSourceRegexTypes(
    enrichedSym: EnrichedSymbol,
    logPrefix: string,
    dependencies: EnrichmentDependencies
): void {
    const {  fileContent } = dependencies;

    const needsType = (enrichedSym.kind === KIND_FIELD || enrichedSym.kind === KIND_PROPERTY) && !enrichedSym.resolvedType;
    const needsReturn = (enrichedSym.kind === KIND_METHOD || enrichedSym.kind === KIND_FUNCTION) && !enrichedSym.returnType;

    if ((!needsType && !needsReturn) || !enrichedSym.selectionRange) {
        return;
    }

    log.debug(`${logPrefix}DEBUG_F: Starting regex fallback for '${enrichedSym.name}'`);

    const lines = fileContent.split('\n');
    const startLine = Math.max(0, enrichedSym.selectionRange.start.line - 5);
    const endLine = Math.min(lines.length, enrichedSym.selectionRange.start.line + 1); 
    const codeSnippet = lines.slice(startLine, endLine).join('\n');

    log.debug(`${logPrefix}  DEBUG_F: Evaluating snippet:\n${codeSnippet}`);
    
    const escapedSymName = escapeRegExp(enrichedSym.name);
    let match: RegExpMatchArray | null = null;

    if (needsType) {
         const fieldRegex = new RegExp(
            `(?:@\\w+(\\([^)]*\\))?\\s*)*(?:\\w+\\s+)*(.+?)\\s+${escapedSymName}\\s*(?:;|=)`
        );
        match = codeSnippet.match(fieldRegex);
        if (match?.[2]) {
            enrichedSym.resolvedType = match[2].replace(/@\w+(\([^)]*\))?/g, '').trim();
            log.debug(`${logPrefix}  ↳ Regex SUCCESS (Field): Field '${enrichedSym.name}' has type: ${enrichedSym.resolvedType}`);
        }
    } else if (needsReturn) {
        const methodRegex = new RegExp(
            `(?:@\\w+(\\([^)]*\\))?\\s*)*(?:static\\s+)?(?:\\w+\\s+)*(.+?)\\s+(?:get\\s+)?${escapedSymName}\\s*\\(`
        );
        match = codeSnippet.match(methodRegex);
        if (match?.[2]) {
            const potentialReturn = match[2].replace(/@\w+(\([^)]*\))?/g, '').trim();
            if (potentialReturn.toLowerCase() !== 'void') {
                enrichedSym.returnType = potentialReturn;
                log.debug(`${logPrefix}  ↳ Regex SUCCESS (Method): Method '${enrichedSym.name}' returns: ${enrichedSym.returnType}`);
            }
        }
    }

    if (!match) {
        log.debug(`${logPrefix}  DEBUG_F: Regex found no match for '${enrichedSym.name}'`);
    }
}