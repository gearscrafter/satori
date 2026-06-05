import { EnrichedSymbol } from "../types/index";
import * as vscode from 'vscode';
import * as fs from 'fs';
import { log } from "../utils/logger";

const fileContentCache = new Map<string, string>();

/**
 * Clears the file content cache. Call this when files change
 * or at the start of a new analysis pass.
 */
export function clearFileContentCache(): void {
    fileContentCache.clear();
}

/**
 * Extracts the source code corresponding to a specific symbol from its
 * origin file. Caches file contents to avoid repeated disk reads
 * for symbols in the same file.
 */
export function getSourceCodeForSymbol(symbol: EnrichedSymbol): string {
  const rangeToUse = symbol.range || symbol.selectionRange;
  if (!rangeToUse || !symbol.fileUri) return '';

  try {
      const filePath = vscode.Uri.parse(symbol.fileUri).fsPath;

      let fileContent = fileContentCache.get(symbol.fileUri);
      if (fileContent === undefined) {
          log.debug(`[Cache MISS] Reading file: ${symbol.fileUri}`);
          fileContent = fs.readFileSync(filePath, 'utf8');
          fileContentCache.set(symbol.fileUri, fileContent);
      } else {
          log.debug(`[Cache HIT] ${symbol.fileUri}`);
      }

      const lines = fileContent.split(/\r?\n/);
      const start = rangeToUse.start;
      const end   = rangeToUse.end;

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
