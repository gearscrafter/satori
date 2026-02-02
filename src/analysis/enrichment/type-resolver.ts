import { parseBaseTypeName } from "../../core";
import { EnrichmentDependencies, TypeReference } from "../../types/index";
import * as vscode from 'vscode';
import { resolvedTypesCache } from "../../utils/caches";
import { log } from "../../utils/logger";

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
  const { allProjectFilesData } = dependencies;
  const baseTypeName = parseBaseTypeName(typeName);

  if (!baseTypeName) return undefined;

  if (resolvedTypesCache.has(typeName)) {
    log.debug(`🧠 [Cache HIT] ${typeName}`);
    return resolvedTypesCache.get(typeName);
  }

  for (const file of allProjectFilesData) {
    for (const symbol of file.symbols) {
      if (
        (symbol.kind === vscode.SymbolKind.Class ||
         symbol.kind === vscode.SymbolKind.Enum ||
         symbol.kind === 22) &&
        symbol.name === baseTypeName
      ) {
        const result: TypeReference = {
          name: typeName,
          definition: {
            name: symbol.name,
            kind: symbol.kind,
            fileUri: symbol.fileUri!,
            selectionRange: symbol.selectionRange!,
            isSDK: !!symbol.isSDK
          }
        };

        resolvedTypesCache.set(typeName, result);
        log.debug(`📦 [Cache SET] ${typeName}`);
        return result;
      }
    }
  }

  const fallbackResult = { name: typeName };
  resolvedTypesCache.set(typeName, fallbackResult);
  return fallbackResult;
}
