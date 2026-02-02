import { EnrichedSymbol, EnrichmentDependencies } from "../types/index";
import * as vscode from 'vscode';
import { enrichWithBasicInfo } from "./enrichment/basic_enrichment";
import { enrichWithTypesFromDetail } from "./enrichment/detail_enrichment";
import { enrichWithSourceRegexTypes } from "./enrichment/regex_enrichment";
import { enrichWithHoverTypes } from "../lsp/hover_enrichment";
import { log } from "../utils/logger";

/**
 * Recursively processes a symbol applying all available enrichment
 * techniques. Coordinates basic enrichment, detail analysis, LSP hover,
 * and regex fallback. Handles asynchronous processing and error propagation.
 * 
 * @param symbolToProcess - Symbol to process and enrich
 * @param currentFileUri - Current file URI of the symbol
 * @param dependencies - Dependencies for enrichment (LSP, content, etc.)
 * @param depth - Recursion depth for logging
 * @param parentEnrichedSymbol - Parent enriched symbol (optional)
 * @returns Fully processed and enriched symbol
 */
export async function processSymbolRecursiveLSP(
        symbolToProcess: EnrichedSymbol, 
        currentFileUri: string,
        dependencies: EnrichmentDependencies,
        depth = 0,
        parentEnrichedSymbol?: EnrichedSymbol,
    ): Promise<EnrichedSymbol> {

        const logPrefix = '  '.repeat(depth);

        if (!symbolToProcess.selectionRange) {
            log.debug(`${logPrefix}⚠️ Symbol '${symbolToProcess.name}' (Kind: ${symbolToProcess.kind}) skipped from enrichment. No selectionRange.`);
            return symbolToProcess;
        }
        
        log.debug(`${logPrefix}🔍 Processing symbol: ${symbolToProcess.name} (Kind: ${symbolToProcess.kind})`);

        const enrichedSym: EnrichedSymbol = {
            ...symbolToProcess,
            fileUri: symbolToProcess.fileUri ?? currentFileUri
        };

        enrichWithBasicInfo(enrichedSym, logPrefix, currentFileUri, dependencies);
        
       try {
          await Promise.all([
              enrichWithTypesFromDetail(enrichedSym, logPrefix, dependencies),
              (async () => {
                  if (!enrichedSym.hoverChecked) {
                      await enrichWithHoverTypes(enrichedSym, logPrefix, dependencies);
                      enrichedSym.hoverChecked = true;
                  }
              })()
          ]);
        } catch (e) {
            log.debug(`${logPrefix}⚠️ Error in async enrich: ${e instanceof Error ? e.message : e}`);
        }

        try {
            enrichWithSourceRegexTypes(enrichedSym, logPrefix, dependencies);
        } catch (e) {
            log.debug(`${logPrefix}⚠️ Error in enrichWithSourceRegexTypes: ${e instanceof Error ? e.message : e}`);
        }

        if (enrichedSym.children && enrichedSym.children.length > 0) {
            const parentForNextRecursion = (enrichedSym.kind === vscode.SymbolKind.Class) ? enrichedSym : parentEnrichedSymbol;
            enrichedSym.children = await Promise.all(
                enrichedSym.children.map(child => 
                    processSymbolRecursiveLSP(child, enrichedSym.fileUri!, dependencies, depth + 1, parentForNextRecursion)
                )
            );
        }

        return enrichedSym;
    }