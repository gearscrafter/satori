import { EnrichedSymbol } from "../types/index";
import { log } from "../utils/logger";

/**
 * Validates consistency and integrity of enriched data after
 * processing. Verifies parent-child relationships, constructor parameter
 * consistency with class fields, and referential integrity of unique IDs.
 * Reports inconsistencies for debugging.
 * 
 * @param enrichedFiles - Array of files with enriched symbols to validate
 */
export function validateEnrichedData(
  enrichedFiles: Array<{ fileUri: string; symbols: EnrichedSymbol[] }>
) {
  const symbolMap = new Map<string, EnrichedSymbol>(); 

  function recurse(symbols: EnrichedSymbol[]) {
    for (const sym of symbols) {
      if (sym.uniqueId) {
        symbolMap.set(sym.uniqueId, sym);
      }

      if (sym.kind === 5) {
        log.debug(`[VALIDATE] Class: ${sym.name}`);
      }

      if (sym.kind === 9) {
        if (!sym.parameters && sym.detail) {
          log.debug(`[WARN] Constructor '${sym.name}' has detail but no parameters were extracted.`);
        }

        if (sym.parentId) {
          const parent = symbolMap.get(sym.parentId);

          if (!parent) {
            log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
          } else {
            if (parent.kind !== 5) {
              log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not a class (kind !== 5)`);
            }

            if (Array.isArray(sym.parameters) && Array.isArray(parent.children)) {
              const parentFields = new Set(parent.children.map(c => c.name));
              for (const param of sym.parameters) {
                if (param.name && !parentFields.has(param.name)) {
                  log.debug(`[WARN] Constructor '${sym.name}' has parameter '${param.name}' that is not found as property in '${parent.name}'`);
                }
              }
            }
          }
        }
      }

      if (sym.parentId && !symbolMap.has(sym.parentId)) {
        log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
      }

      if (sym.children) recurse(sym.children);
    }
  }
  try{
    for (const file of enrichedFiles) {
      recurse(file.symbols);
    }
  } catch(err){
    log.error(`Error running validateEnrichedData:, ${err}`);
  }
  
}