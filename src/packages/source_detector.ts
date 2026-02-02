import path from "path";
import { ExternalPackageInfo, FileSource } from "../types/index";
import * as vscode from 'vscode';
import { log } from "../utils/logger";

/**
 * Determines the origin of a file by analyzing its path and comparing it against
 * known packages. Classifies files as project, external package, or SDK
 * using path normalization for robust comparison and error handling.
 * 
 * @param fileUri - URI of the file to analyze
 * @param allPackages - Array of available external package information
 * @returns FileSource object with type and origin metadata
 */
export function determineFileSource(
  fileUri: string, 
  allPackages: ExternalPackageInfo[]
): FileSource {
  try {
    if (!fileUri) return { type: 'project' };
    const filePath = vscode.Uri.parse(fileUri).fsPath;

    if (filePath.includes('dart-sdk/lib') || filePath.includes('flutter/bin/cache/dart-sdk')) {
      return { type: 'sdk', packageType: 'sdk' };
    }

    const normalizedFilePath = path.normalize(filePath);

    for (const pkg of allPackages) {
      const normalizedPkgPath = path.normalize(pkg.path);
      if (normalizedFilePath.startsWith(normalizedPkgPath)) {
        
        return {
          type: pkg.type === 'custom' ? 'project' : 'external_package',
          packageName: pkg.name,
          packageVersion: pkg.version,
          packageType: pkg.type,
          relativePath: path.relative(pkg.path, filePath)
        };
      }
    }

    return { type: 'project' };

  } catch (error) {
    log.error(`❌ ERROR in determineFileSource when processing URI: "${fileUri}"`);
    if (error instanceof Error) log.error(`   -> Message:${error.message}`);
    return { type: 'project' };
  }
}