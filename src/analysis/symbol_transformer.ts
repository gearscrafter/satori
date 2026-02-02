import { EnrichedSymbol } from "../types/index";
import * as vscode from 'vscode';

/**
 * Recursively converts raw LSP symbols (DocumentSymbol) to internal
 * EnrichedSymbol format. Ensures both range properties are copied
 * correctly and establishes parent-child hierarchy with unique IDs.
 * 
 * @param lspSymbols - Array of LSP DocumentSymbol to transform
 * @param parentId - Parent symbol ID (optional)
 * @param fileUri - File URI for context (optional)
 * @returns Array of symbols in EnrichedSymbol format
 */
export function transformLspSymbols(
    lspSymbols: vscode.DocumentSymbol[],
    parentId?: string,
    fileUri?: string
): EnrichedSymbol[] {
    if (!lspSymbols || lspSymbols.length === 0) return [];

    return lspSymbols.map((s: vscode.DocumentSymbol) => {
    const uniqueId = `${fileUri}#${s.name}#${s.kind}`;
    
    const enriched: EnrichedSymbol = {
        name: s.name,
        kind: s.kind,
        detail: s.detail || '',
        range: s.range,
        selectionRange: s.selectionRange,
        fileUri,
        uniqueId,
        parentId, 
        children: []
    };

    enriched.children = transformLspSymbols(s.children ?? [], uniqueId, fileUri);

    return enriched;
    });
}
