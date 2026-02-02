import { escapeRegExp } from "../core";
import { EnrichedSymbol, EnrichmentDependencies } from "../types/index";

import * as vscode from 'vscode';
import { log } from "../utils/logger";

/**
 * Enriches symbols using hover information from the Language Server Protocol.
 * Extracts field types, method return types, and constructor parameters
 * from LSP hover responses. Includes client state verification
 * and communication error handling.
 * 
 * @param enrichedSym - Symbol to enrich with hover information
 * @param logPrefix - Prefix for logging with indentation
 * @param dependencies - Dependencies including LSP client
 */
export async function enrichWithHoverTypes(
    enrichedSym: EnrichedSymbol,
    logPrefix: string,
    dependencies: EnrichmentDependencies,
): Promise<void> {
    const needsTypeInfo = (
        (enrichedSym.kind === vscode.SymbolKind.Field || enrichedSym.kind === vscode.SymbolKind.Property) && !enrichedSym.resolvedType
    ) || (
        (enrichedSym.kind === vscode.SymbolKind.Method || enrichedSym.kind === vscode.SymbolKind.Function) && !enrichedSym.returnType
    ) || (
        enrichedSym.kind === vscode.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0)
    );


    if (!enrichedSym.fileUri || !enrichedSym.selectionRange || !needsTypeInfo) {
      log.debug(`${logPrefix}  ⚠️ Skipped enrichHover for '${enrichedSym.name}' (kind: ${enrichedSym.kind}) → needsTypeInfo: ${needsTypeInfo}`);  
      return;
    }

    if (enrichedSym.hoverChecked) return;
    enrichedSym.hoverChecked = true;

    const escapedSymName = escapeRegExp(enrichedSym.name);

    try {
        const hoverResultArray = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            vscode.Uri.parse(enrichedSym.fileUri),
            enrichedSym.selectionRange.start
        );

        const hoverResult = (hoverResultArray && hoverResultArray.length > 0) ? hoverResultArray[0] : null;

        if (!hoverResult?.contents?.length) {
            return;
        }

        log.debug(`${logPrefix}  🧪 Checking if '${enrichedSym.name}' is constructor`);
        log.debug(`${logPrefix}     → kind: ${enrichedSym.kind} (${vscode.SymbolKind[enrichedSym.kind]})`);
        log.debug(`${logPrefix}     → parameters: ${enrichedSym.parameters?.length ?? 'undefined'}`);

        const contentString = hoverResult.contents.map(content =>
            (typeof content === 'string') ? content : content.value
        ).join('\n');

        if ((enrichedSym.kind === vscode.SymbolKind.Field || enrichedSym.kind === vscode.SymbolKind.Property) && !enrichedSym.resolvedType) {
            const fieldRegex = new RegExp("```dart\\s*(?:[\\w\\s]+\\s)?(.+?)\\s+" + escapedSymName);
            const match = contentString.match(fieldRegex);
            
            if (match && match[1]) {
                enrichedSym.resolvedType = match[1].trim();
                log.debug(`${logPrefix}  ↳ Hover: Field '${enrichedSym.name}' resolved type: ${enrichedSym.resolvedType}`);
            }
        } else if ((enrichedSym.kind === vscode.SymbolKind.Method || enrichedSym.kind === vscode.SymbolKind.Function) && !enrichedSym.returnType) {
            const methodRegex = new RegExp("```dart\\s*(?:static\\s+)?(.+?)\\s+(?:get\\s+)?[\"'`]?" + escapedSymName + "[\"'`]?\s*\\(");
            const match = contentString.match(methodRegex);

            if (match && match[1]) {
                const returnType = match[1].trim();
                if (returnType.toLowerCase() !== 'void') {
                    enrichedSym.returnType = returnType;
                    log.debug(`${logPrefix}  ↳ Hover: Method '${enrichedSym.name}' return type: ${enrichedSym.returnType}`);
                }
            }
          } else if (enrichedSym.kind === vscode.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0)) {
              log.debug(`${logPrefix}  [DEBUG-CONSTRUCTOR] Constructor found: ${enrichedSym.name}`);

              const paramRegex = /this\.(\w+)/g;
              const matches = [...contentString.matchAll(paramRegex)];

              if (matches.length > 0) {
                enrichedSym.parameters = matches.map(match => ({
                  name: match[1],
                  type: `self_field:${match[1]}`
                }));

                log.debug(`${logPrefix}  ↳ Hover: Constructor '${enrichedSym.name}' extracted parameters: ${enrichedSym.parameters.map(p => p.name).join(', ')}`);
              } else {
                log.debug(`${logPrefix}  ⚠️ Constructor '${enrichedSym.name}' without extractable parameters via hover`);
              }
          }
    } catch (e: any) {
        log.error(`${logPrefix}  ⚠️ Error in Hover for ${enrichedSym.name}: ${e.message}`);
    }
}