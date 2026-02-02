import * as fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';

/**
 * Recursively searches for Dart files in a package's lib folder up to
 * a maximum depth of 3 levels. Limits the result to the specified maximum
 * number and ignores hidden directories to optimize performance.
 * 
 * @param libPath - Path to the package's lib folder
 * @param maxFiles - Maximum number of files to find (default: 20)
 * @returns Array of full paths to found .dart files
 */
export function findDartFilesInPackage(libPath: string, maxFiles: number = 20): string[] {
  const dartFiles: string[] = [];
  
  try {
    function searchRecursive(currentPath: string, depth: number = 0) {
      if (depth > 3 || dartFiles.length >= maxFiles) return;
      
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (dartFiles.length >= maxFiles) break;
        
        if (entry.isFile() && entry.name.endsWith('.dart')) {
          dartFiles.push(path.join(currentPath, entry.name));
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          searchRecursive(path.join(currentPath, entry.name), depth + 1);
        }
      }
    }
    
    searchRecursive(libPath);
  } catch (error) {
  }
  
  return dartFiles;
}


/**
 * Extracts imported package names from a Dart file using regular
 * expression analysis. Searches for import declarations that use the format
 * 'package:package_name/' and returns unique set of names.
 * 
 * @param fileUri - URI of the Dart file to analyze
 * @returns Array of unique imported package names
 */
export function extractPackageImportsFromFile(fileUri: string): string[] {
    try {
        const filePath = vscode.Uri.parse(fileUri).fsPath;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        const importRegex = /import\s+['"]package:([\w]+)\//g;
        const imports = new Set<string>();
        let match;

        while ((match = importRegex.exec(fileContent)) !== null) {
            imports.add(match[1]);
        }
        return Array.from(imports);
    } catch (e) {
        return [];
    }
}