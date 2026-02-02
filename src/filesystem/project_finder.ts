import * as vscode from 'vscode';
import * as path from 'path';
import { findDirectoriesByPattern } from './pattern_matcher';
import { containsDartFiles } from './directory_scanner';
import { log } from '../utils/logger';

/**
 * Searches for nested custom directories that follow common patterns.
 * @param projectRoot The root path of the project.
 * @param customDirectories Array where the found directories will be added.
 */
export async function searchNestedCustomDirectories(
  projectRoot: string, 
  customDirectories: vscode.Uri[],
): Promise<void> {
  
  const commonPatterns = [
    'packages/*/lib',    
    'modules/*/lib',     
    'features/*/lib',    
    'apps/*/lib',        
    'plugins/*/lib',      
    'shared/*/lib',       
  ];

  for (const pattern of commonPatterns) {
    try {
      const globPattern = path.join(projectRoot, pattern);
      const matchingDirs = await findDirectoriesByPattern(globPattern);
      
      for (const dir of matchingDirs) {
        if (await containsDartFiles(dir)) {
          const parentDir = path.dirname(dir); 
          const parentUri = vscode.Uri.file(parentDir);
        
          if (!customDirectories.some(existing => existing.fsPath === parentDir)) {
            customDirectories.push(parentUri);
            log.debug(`📦 Modular directory found: ${path.relative(projectRoot, parentDir)}`);
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
}

