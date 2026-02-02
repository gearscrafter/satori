import { EnrichedSymbol, EnrichmentDependencies } from "../../types/index";
import * as vscode from 'vscode';
import { log } from "../../utils/logger";

/**
 * Enriches a symbol with basic information including file URI, SDK status,
 * access level based on naming, and inheritance relationships if it's a class.
 * Searches for pre-calculated relationships in the dependencies map and assigns them to the symbol.
 * 
 * @param enrichedSym - Symbol to enrich with basic information
 * @param logPrefix - Prefix for logging with indentation
 * @param currentFileUri - Current file URI
 * @param dependencies - Dependencies with class relationships and other data
 */
export function enrichWithBasicInfo(
    enrichedSym: EnrichedSymbol,
    logPrefix: string,
    currentFileUri: string,
    dependencies: EnrichmentDependencies
): void {

    log.debug(`${logPrefix}  [Basic Info] Enriching  '${enrichedSym.name}'...`);

    enrichedSym.fileUri = enrichedSym.fileUri || currentFileUri;
    enrichedSym.isSDK = !!enrichedSym.fileUri?.includes('/dart-sdk/lib/');

    enrichedSym.access = enrichedSym.name.startsWith('_') ? 'private' : 'public';
    
    log.debug(`${logPrefix}    ↳ Final fileUri: ${enrichedSym.fileUri}`);
    log.debug(`${logPrefix}    ↳ Access: ${enrichedSym.access}, Is SDK: ${enrichedSym.isSDK}`);
    
    if (enrichedSym.parentId) {
        log.debug(`${logPrefix}   ↳ parentId: ${enrichedSym.parentId}`);
    }

    if (enrichedSym.kind === vscode.SymbolKind.Class) { 
        const classKey = `${enrichedSym.fileUri}#${enrichedSym.name.split('<')[0].trim()}`;

        log.debug(`${logPrefix}    ↳ It's a class. Searching relationships with key:  "${classKey}"`);
        
        const relations = dependencies.projectClassRelations.get(classKey);

        if (relations) {
           const logMessage = [
               `Extends: ${relations.extends?.join(', ') || 'none'}`,
               `Implements: ${relations.implements?.join(', ') || 'none'}`,
               `With: ${relations.with?.join(', ') || 'none'}`
           ].join('; ');
           log.debug(`${logPrefix}    ↳ ✅ SUCCESS: Inheritance relationships found. ${logMessage}`);
           
            if (!enrichedSym.relations) {
                enrichedSym.relations = {};
            }
            enrichedSym.relations.extends = relations.extends;
            enrichedSym.relations.implements = relations.implements;
            enrichedSym.relations.with = relations.with;
        } else {
            log.debug(`${logPrefix} ↳ INFO: No pre-calculated inheritance relationships found for this class.`);
        }
    }
}