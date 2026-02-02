import { EnrichedSymbol, EnrichmentDependencies, ParsedParameter } from "../../types/index";
import * as vscode from 'vscode';
import { resolveTypeByName } from "./type-resolver";
import { log } from "../../utils/logger";

/**
 * Enriches symbols by extracting type information from the LSP 'detail'
 * property. Parses method and constructor parameters, field types, and return
 * types using sophisticated string analysis with handling of named,
 * optional, and this.field parameters.
 * 
 * @param enrichedSym - Symbol to enrich with detail information
 * @param logPrefix - Prefix for logging with indentation  
 * @param dependencies - Dependencies for type resolution
 */
export async function enrichWithTypesFromDetail(
    enrichedSym: EnrichedSymbol,
    logPrefix: string,
    dependencies: EnrichmentDependencies
): Promise<void> {
    const symbol = enrichedSym; 
    if (!symbol.detail || typeof symbol.detail !== 'string') return;

    log.debug(`[DEBUG-ENRICH-DETAIL] Enriching ${symbol.name}, detail: ${symbol.detail}`);

    log.debug(`${logPrefix}  [DEBUG] symbol.kind: ${symbol.kind}, symbol.detail: ${symbol.detail}`);

     log.debug(`${logPrefix}  [Type Detail] Analyzing detail: "${symbol.detail}"`);
        
    if ((symbol.kind === vscode.SymbolKind.Field || symbol.kind === vscode.SymbolKind.Property) && !enrichedSym.resolvedType) {
        const fieldTypeMatch = symbol.detail.match(
          /^\s*(?:(?:@[\w.]+\s*)*(?:late|final|const|static|required|covariant)\s+)*([\w<>\[\]\{\},?().\s]+?)\s+[\w$]+\s*(?:=.*)?$/
        );

        if (fieldTypeMatch?.[1]) {
          enrichedSym.resolvedType = fieldTypeMatch[1].trim();
          log.debug(`${logPrefix}  ↳ Detail: Campo '${symbol.name}' tipo extraído: ${enrichedSym.resolvedType}`);
          enrichedSym.resolvedTypeRef = await resolveTypeByName(enrichedSym.resolvedType, dependencies);
        }

    }
    else if (/\(.*\)/s.test(symbol.detail)) {
        log.debug(`${logPrefix}  [DEBUG] Evaluating enrichedSym.parameters, current value: ${JSON.stringify(enrichedSym.parameters)}`);
        if (!Array.isArray(enrichedSym.parameters) || enrichedSym.parameters.length === 0) {
          log.debug(`${logPrefix}  [DEBUG] enrichedSym.parameters is undefined or empty. Starting parsing.`);
          enrichedSym.parameters = [];
            const paramsContentRegex = /\((.*)\)/s;
            const paramsMatch = symbol.detail.match(paramsContentRegex);
            
            if (!paramsMatch || typeof paramsMatch[1] !== 'string') {
              log.debug(`${logPrefix}   ⚠️ Could not extract content between parentheses from detail: "${symbol.detail}"`);
            }

            if (paramsMatch && typeof paramsMatch[1] === 'string') {
              log.debug(`${logPrefix}    📌 paramsMatch: ${paramsMatch?.[1]}`);
                let fullParamsString = paramsMatch[1].trim();
                log.debug(`${logPrefix}    📌 fullParamsString: "${fullParamsString}"`);
                if (fullParamsString !== '') {
                    let requiredParamsStr = fullParamsString;
                    let optionalPositionalStr = '';
                    let namedParamsStr = '';
                    const namedStartIndex = fullParamsString.indexOf('{');
                    const namedEndIndex = fullParamsString.lastIndexOf('}');
                    if (namedStartIndex !== -1 && namedEndIndex > namedStartIndex) {
                        const partBeforeNamed = fullParamsString.substring(0, namedStartIndex);
                        if (!partBeforeNamed.substring(partBeforeNamed.lastIndexOf('[') > partBeforeNamed.lastIndexOf('{') ? partBeforeNamed.lastIndexOf('[') : 0).includes('}')) {
                            namedParamsStr = fullParamsString.substring(namedStartIndex + 1, namedEndIndex).trim();
                            requiredParamsStr = partBeforeNamed.trim();
                        }
                    }
                    const optionalStartIndex = requiredParamsStr.indexOf('[');
                    const optionalEndIndex = requiredParamsStr.lastIndexOf(']');
                    if (optionalStartIndex !== -1 && optionalEndIndex > optionalStartIndex) {
                        if (!requiredParamsStr.substring(optionalStartIndex).includes('{')) {
                            optionalPositionalStr = requiredParamsStr.substring(optionalStartIndex + 1, optionalEndIndex).trim();
                            requiredParamsStr = requiredParamsStr.substring(0, optionalStartIndex).trim();
                        }
                    }
                    if (requiredParamsStr.endsWith(',')) {
                        requiredParamsStr = requiredParamsStr.substring(0, requiredParamsStr.length - 1).trim();
                    }
                    
                    
                    function parseIndividualParamList(paramSubString: string, areNamed: boolean, areOptionalPositional: boolean): ParsedParameter[] {
                        let remaining = paramSubString.trim();
                        const parsedParams: ParsedParameter[] = [];

                        if (remaining === '') return parsedParams;

                        const singleParamRegex = /^\s*(?:(required|covariant)\s+)?((?:[\w$.<>?\[\]\s(),']+?|Function\s*\((?:[^)]*\))?\s*\??))\s+([\w$]+)\s*(?:=.*?)?(?:,|$)/;
                        const thisFieldWithOptionalRequiredRegex = /^\s*(required\s+)?this\.([\w$]+)\s*(?:=.*?)?(?:,|$)/;
                        const functionTypeParamRegex = /^\s*(?:(required|covariant)\s+)?((?:[\w$<>?,.\s\[\]]+\s+)?Function\s*\((?:[^)]*?\))?\s*\??)\s+([\w$]+)\s*(?:=.*?)?(?:,|$)/;
                        const typeOrNameOnlyRegex = /^\s*((?:[\w$]+(?:<[\w$,\s<>?]+(?:<[\w$,\s<>?]+>)?\??>)?\??)|(?:(?:[\w$<>?,.\s\[\]]+\s+)?Function\s*\((?:[^)]*?\))?\s*\??)|(?:[\w$.]+))\s*(?:,|$)/;

                        while (remaining.length > 0) {
                            let parsedThisIteration = false;
                            let pMatch;

                            pMatch = remaining.match(thisFieldWithOptionalRequiredRegex);
                            if (pMatch && pMatch[2]) { 
                                const isRequiredForThis = !!pMatch[1]; 
                                const fieldName = pMatch[2].trim();
                                parsedParams.push({
                                    name: fieldName,
                                    type: `self_field:${fieldName}`,
                                    isNamed: areNamed, 
                                    isRequired: areNamed && isRequiredForThis, 
                                    isOptionalPositional: false 
                                });
                                parsedThisIteration = true;
                            } else {
                                pMatch = remaining.match(functionTypeParamRegex);
                                if (pMatch && pMatch[2] && pMatch[3]) { 
                                    parsedParams.push({
                                        type: pMatch[2].trim().replace(/\s+/g, ' '),
                                        name: pMatch[3].trim(),
                                        isNamed: areNamed,
                                        isRequired: areNamed && !!pMatch[1] && pMatch[1] === 'required',
                                        isOptionalPositional: areOptionalPositional
                                    });
                                    parsedThisIteration = true;
                                } else {
                                    pMatch = remaining.match(singleParamRegex);
                                    if (pMatch && pMatch[2] && pMatch[3]) { 
                                        parsedParams.push({
                                            type: pMatch[2].trim().replace(/\s+/g, ' '),
                                            name: pMatch[3].trim(),
                                            isNamed: areNamed,
                                            isRequired: areNamed && !!pMatch[1] && pMatch[1] === 'required',
                                            isOptionalPositional: areOptionalPositional
                                        });
                                        parsedThisIteration = true;
                                    }
                                }
                            }

                            if (parsedThisIteration && pMatch) { 
                                let consumedLength = pMatch[0].length;
                                if (!pMatch[0].endsWith(',') && remaining.length > consumedLength && remaining[consumedLength] === ',') {
                                    consumedLength++;
                                }
                                remaining = remaining.substring(consumedLength).trim();
                            } 
                            else { 
                                pMatch = remaining.match(typeOrNameOnlyRegex); 
                                if (pMatch && pMatch[1]) {
                                    const potentialTypeOrName = pMatch[1].trim().replace(/\s+/g, ' ');
                                    let paramToAdd: ParsedParameter;
                                    if (areNamed || areOptionalPositional || potentialTypeOrName.match(/[<>?()]|Function|^void$|^dynamic$|^Never$|^Null$|^Object$|^bool$|^int$|^double$|^num$|^String$/i) ) {
                                        paramToAdd = { type: potentialTypeOrName, name: undefined, isNamed: areNamed, isOptionalPositional: areOptionalPositional, isRequired: areNamed && remaining.startsWith('required ') };
                                    } else {
                                        paramToAdd = { type: 'dynamic', name: potentialTypeOrName, isNamed: areNamed, isOptionalPositional: areOptionalPositional, isRequired: areNamed && remaining.startsWith('required ') };
                                    }
                                    parsedParams.push(paramToAdd);
                                    let consumedLength = pMatch[0].length;
                                    if (!pMatch[0].endsWith(',') && remaining.length > consumedLength && remaining[consumedLength] === ',') {
                                        consumedLength++;
                                    }
                                    remaining = remaining.substring(consumedLength).trim();
                                } else { 
                                    if (remaining.trim().length > 0) {
                                        log.debug(`${logPrefix}  Could not continue parsing parameters for ${symbol.name}. Remaining: '${remaining}'`);
                                    }
                                    break;
                                }
                            }
                        } 
                        log.debug(`${logPrefix}    📌 Parsed ${parsedParams.length} parameters from block${areNamed ? 'named' : areOptionalPositional ? 'optional' : 'required'}: ${JSON.stringify(parsedParams, null, 2)}`);
                        return parsedParams;
                    }

                    if (requiredParamsStr) {
                      const parsedRequired = parseIndividualParamList(requiredParamsStr, false, false);
                      log.debug(`${logPrefix}    📌 requiredParamsStr -> ${requiredParamsStr}`);
                      log.debug(`${logPrefix}    📌 parsedRequired -> ${JSON.stringify(parsedRequired)}`);
                      enrichedSym.parameters.push(...parsedRequired);
                    }
                    if (optionalPositionalStr) {
                      const optionalRequired = parseIndividualParamList(optionalPositionalStr, false, true);
                      log.debug(`${logPrefix}    📌 optionalPositionalStr -> ${optionalPositionalStr}`);
                      log.debug(`${logPrefix}    📌 optionalRequired -> ${JSON.stringify(optionalRequired)}`);
                      enrichedSym.parameters.push(...optionalRequired);
                    }
                    if (namedParamsStr) {
                      const namedRequired = parseIndividualParamList(namedParamsStr, true, false);
                      log.debug(`${logPrefix}    📌 namedParamsStr -> ${namedParamsStr}`);
                      log.debug(`${logPrefix}    📌 namedRequired -> ${JSON.stringify(namedRequired)}`);
                      enrichedSym.parameters.push(...namedRequired);
                    }
                
                    log.debug(`${logPrefix}  [DEBUG] enrichedSym.parameters now has: ${JSON.stringify(enrichedSym.parameters)}`);
                    if (enrichedSym.parameters.length === 0) {
                      log.debug(`${logPrefix}    ⚠️ enrichedSym.parameters is still empty after parsing`);
                    }


                  }
            }
        }

        if (enrichedSym.parameters && enrichedSym.parameters.length > 0) {
            for (const param of enrichedSym.parameters) {
                if (!param.type.startsWith('self_field:')) {
                    param.typeRef = await resolveTypeByName(param.type, dependencies);
                } else {
                    param.typeRef = { name: param.type };
                }
            }
            log.debug(`${logPrefix}  ↳ Detail: Resolved types for ${enrichedSym.parameters.length} parameters in '${symbol.name}'.`);
        }
        
        if (symbol.kind !== vscode.SymbolKind.Constructor && !enrichedSym.returnType) {
            const normalizedDetail = symbol.detail
            .replace(/@[\w.]+\s*/g, '')                  
            .replace(/\b(static|external|async|sync|factory|late|final|const|required)\b\s*/g, '')
            .trim();
            const escapedName = symbol.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const returnTypeRegex = new RegExp(
              `^([\\w<>{}\\[\\]\\s.,?()]+?)\\s+${escapedName}\\s*\\(`
            );
            const match = normalizedDetail.match(returnTypeRegex);
            if (match?.[1]) {
              const returnType = match[1].trim();
              if (returnType.toLowerCase() !== 'void') {
                enrichedSym.returnType = returnType;
                log.debug(`${logPrefix}  ↳ Detail: Method '${symbol.name}' extracted return type: ${returnType}`);
                enrichedSym.returnTypeRef = await resolveTypeByName(returnType, dependencies);
              }
            } else {
              log.debug(`${logPrefix}  ⚠️ Could not extract return type for '${symbol.name}'`);
            }
        }
    }
    if (
      symbol.kind === vscode.SymbolKind.Constructor &&
        (enrichedSym.parameters?.length === 0) &&
        /^\s*\(\s*\{\s*this\.[\w$]+/.test(symbol.detail)
      ) {
        const fallbackThisRegex = /this\.([\w$]+)/g;
        const fallbackParams: ParsedParameter[] = [];
        let match;
        while ((match = fallbackThisRegex.exec(symbol.detail)) !== null) {
          const fieldName = match[1];
          fallbackParams.push({
            name: fieldName,
            type: `self_field:${fieldName}`,
            isNamed: true,
            isRequired: false,
            isOptionalPositional: false,
          });
        }

        if (fallbackParams.length > 0) {
          enrichedSym.parameters = fallbackParams;
          log.debug(`${logPrefix}  ↳ Fallback: Inferred ${fallbackParams.length} this.field parameters for '${symbol.name}'.`);
        }
      }

      if (!Array.isArray(enrichedSym.parameters)) {
        enrichedSym.parameters = [];
        log.debug(`${logPrefix}    ⚠️ Forced enrichedSym.parameters = [] because it remained undefined.`);
      }
    log.debug(`[DEBUG-ENRICH-DETAIL] Generated params: ${JSON.stringify(enrichedSym.parameters, null, 2)}`);
}
