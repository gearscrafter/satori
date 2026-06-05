import { parseBaseTypeName } from "../../core";
import { EnrichedSymbol, EnrichmentDependencies, TypeReference } from "../../types/index";
import * as vscode from 'vscode';
import { resolvedTypesCache } from "../../utils/caches";
import { log } from "../../utils/logger";

let _typeIndex: Map<string, EnrichedSymbol> | null = null;

/**
 * Builds a name->symbol index from all project files.
 * Must be called once before starting enrichment, then cleared after.
 * Only indexes types that can be referenced: Class, Enum, Struct (22).
 */
export function buildTypeIndex(
  allProjectFilesData: EnrichmentDependencies['allProjectFilesData']
): void {
  _typeIndex = new Map<string, EnrichedSymbol>();
 
  for (const file of allProjectFilesData) {
    for (const symbol of file.symbols) {
      if (
        symbol.kind === vscode.SymbolKind.Class ||
        symbol.kind === vscode.SymbolKind.Enum ||
        symbol.kind === 22
      ) {
        if (!_typeIndex.has(symbol.name)) {
          _typeIndex.set(symbol.name, symbol);
        }
      }
    }
  }
 
  log.debug(`[TypeIndex] Built index with ${_typeIndex.size} types.`);
}

/**
 * Clears the type index after enrichment is complete to free memory.
 */
export function clearTypeIndex(): void {
  _typeIndex = null;
  log.debug(`[TypeIndex] Index cleared.`);
}

/**
 * Searches for the complete definition of a type by its name throughout the project.
 * Uses cache to optimize repeated searches and searches in all project files
 * for types that match the provided base name.
 * 
 * @param typeName - Name of the type to search for (may include generics)
 * @param dependencies - Dependencies with data from all project files
 * @returns TypeReference with complete definition or undefined if not found
 */
export async function resolveTypeByName(
  typeName: string,
  dependencies: EnrichmentDependencies
): Promise<TypeReference | undefined> {
   const baseTypeName = parseBaseTypeName(typeName);
  if (!baseTypeName) return undefined;
 
  if (resolvedTypesCache.has(typeName)) {
    log.debug(` [Cache HIT] ${typeName}`);
    return resolvedTypesCache.get(typeName);
  }
 
  let foundSymbol: EnrichedSymbol | undefined;
 
  if (_typeIndex) {
    foundSymbol = _typeIndex.get(baseTypeName);
    log.debug(`🗂️ [Index ${foundSymbol ? 'HIT' : 'MISS'}] ${baseTypeName}`);
  } else {
    log.debug(`⚠️ [TypeIndex] Index not built, falling back to linear search for '${baseTypeName}'`);
    for (const file of dependencies.allProjectFilesData) {
      for (const symbol of file.symbols) {
        if (
          (symbol.kind === vscode.SymbolKind.Class ||
           symbol.kind === vscode.SymbolKind.Enum ||
           symbol.kind === 22) &&
          symbol.name === baseTypeName
        ) {
          foundSymbol = symbol;
          break;
        }
      }
      if (foundSymbol) break;
    }
  }
 
  if (foundSymbol) {
    const result: TypeReference = {
      name: typeName,
      definition: {
        name: foundSymbol.name,
        kind: foundSymbol.kind,
        fileUri: foundSymbol.fileUri!,
        selectionRange: foundSymbol.selectionRange!,
        isSDK: !!foundSymbol.isSDK
      }
    };
    resolvedTypesCache.set(typeName, result);
    log.debug(`📦 [Cache SET] ${typeName}`);
    return result;
  }
 
  const fallbackResult = { name: typeName };
  resolvedTypesCache.set(typeName, fallbackResult);
  return fallbackResult;
}