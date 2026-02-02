import * as path from 'path';
import * as fs from 'fs';
import { log } from '../utils/logger';

/**
 * Recursively searches up the directory tree to find the Flutter/Dart project root,
 * identified by the presence of pubspec.yaml. It limits the search to 10 levels
 * to prevent infinite loops.
 *
 * @param startPath - The initial path from where to start the search.
 * @returns The project root path or null if not found.
 */
export function findProjectRootWithPubspec(startPath: string): string | null {
  log.debug(`[Project Root] Searching for pubspec.yaml from${startPath}`);
  try{
    let currentPath = startPath;
    const maxLevels = 10; 
    let level = 0;
    
    while (level < maxLevels) {
      const pubspecPath = path.join(currentPath, 'pubspec.yaml');
      if (fs.existsSync(pubspecPath)) {
        log.debug(`✅ Found pubspec.yaml in: ${currentPath}`);
        return currentPath;
      }
      
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      
      currentPath = parentPath;
      level++;
    }
    
    log.debug(`⚠️ Could not find pubspec.yaml searching from: ${startPath}`);
    return null;
  }catch (err){
    log.debug('---');
    log.debug(`❌ [Project Root] CRITICAL ERROR while searching for the project root.`);
    
    if (err instanceof Error) {
      log.debug(`   Error message: ${err.message}`);
    } else {
      log.debug(`   Unknown error: ${String(err)}`);
    }
    log.debug('---');
    
    return null;
  }
}

/**
 * Finds directories that match a glob pattern.
 * @param globPattern The glob pattern to search for.
 * @returns An array of matching directory paths.
 */
export async function findDirectoriesByPattern(globPattern: string): Promise<string[]> {
  const directories: string[] = [];
  
   const parts = globPattern.split(path.sep);
  const basePath = parts[0];
  
  if (!fs.existsSync(basePath)) {
    return directories;
  }

   function searchRecursive(currentPath: string, remainingParts: string[]): void {
    if (remainingParts.length === 0) {
      if (fs.existsSync(currentPath) && fs.statSync(currentPath).isDirectory()) {
        directories.push(currentPath);
      }
      return;
    }

    const [nextPart, ...restParts] = remainingParts;
    
    if (nextPart === '*') {
     
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const subPath = path.join(currentPath, entry.name);
            searchRecursive(subPath, restParts);
          }
        }
      } catch {
       
      }
    } else {
     
      const specificPath = path.join(currentPath, nextPart);
      if (fs.existsSync(specificPath)) {
        searchRecursive(specificPath, restParts);
      }
    }
  }

  searchRecursive(basePath, parts.slice(1));
  return directories;
}
