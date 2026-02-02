import { EnrichedSymbol } from "../types/index";
import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Extracts the source code corresponding to a specific symbol from its
 * origin file. Uses range information to extract the exact text,
 * handling both single-line and multi-line ranges with robust
 * file access error handling.
 * 
 * @param symbol - Enriched symbol with location information
 * @returns Symbol's source code or empty string if cannot be obtained
 */
export function getSourceCodeForSymbol(symbol: EnrichedSymbol): string {
  const rangeToUse = symbol.range || symbol.selectionRange;
  if (!rangeToUse || !symbol.fileUri) return '';

  try {
    const filePath = vscode.Uri.parse(symbol.fileUri).fsPath;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split(/\r?\n/);

    const start = rangeToUse.start;
    const end = rangeToUse.end;

    if (start.line >= lines.length || end.line >= lines.length) return '';

    if (start.line === end.line) {
      return lines[start.line].substring(start.character, end.character);
    }

    let text = lines[start.line].substring(start.character);
    for (let i = start.line + 1; i < end.line; i++) {
      text += '\n' + lines[i];
    }
    text += '\n' + lines[end.line].substring(0, end.character);
    return text;

  } catch {
    return '';
  }
}
