import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { searchNestedCustomDirectories } from './project_finder';
import { log } from '../utils/logger';

/**
 * Searches for custom folders containing .dart files outside of standard locations.
 * @param rootUri URI of the project's root directory.
 * @returns Array of URIs for custom directories containing Dart files.
 */
export async function findCustomDartDirectories(rootUri: vscode.Uri,): Promise<vscode.Uri[]> {
  const customDirectories: vscode.Uri[] = [];
  const projectRoot = rootUri.fsPath;

  const standardDirs = new Set([
    'lib', 'test', 'example', 'tool', 'bin', 'integration_test',
    '.dart_tool', 'build', '.packages', 'node_modules'
  ]);
  

  try {
    const allEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    
    for (const entry of allEntries) {
      if (!entry.isDirectory()) continue;
      
      const dirName = entry.name;
      
      if (dirName.startsWith('.') || 
          dirName.startsWith('_') ||
          standardDirs.has(dirName) ||
          dirName === 'android' || 
          dirName === 'ios' || 
          dirName === 'web' || 
          dirName === 'windows' || 
          dirName === 'macos' || 
          dirName === 'linux') {
        continue;
      }

      const fullDirPath = path.join(projectRoot, dirName);
      
      if (await containsDartFiles(fullDirPath)) {
        const dirUri = vscode.Uri.file(fullDirPath);
        customDirectories.push(dirUri);
        log.debug(`🔍 Custom directory found: ${dirName}`);
      }
    }

      await searchNestedCustomDirectories(projectRoot, customDirectories);

  } catch (error) {
    log.error(`⚠️ Error scanning custom directories: ${error}`);
  }

  return customDirectories;
}


/**
 * Recursively checks if a directory contains .dart files.
 * @param dirPath Path of the directory to check.
 * @param maxDepth Maximum search depth to prevent infinite recursion.
 * @returns true if at least one .dart file is found.
 */
export async function containsDartFiles(dirPath: string, maxDepth: number = 3): Promise<boolean> {
  if (maxDepth <= 0 || !fs.existsSync(dirPath)) {
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.dart')) {
        return true; 
      }
      
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subDirPath = path.join(dirPath, entry.name);
        if (await containsDartFiles(subDirPath, maxDepth - 1)) {
          return true;
        }
      }
    }
  } catch (error) {
   
    return false;
  }

  return false;
}