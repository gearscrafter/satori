import path from "path";
import * as vscode from 'vscode';
import { ExternalPackageInfo } from "../types/index";
import * as fs from 'fs';
import { analyzeExternalPackage } from "./package_analyzer";
import { log } from "../utils/logger";
import { findProjectRootWithPubspec } from "../filesystem/pattern_matcher";

/**
 * Finds and analyzes ALL project packages (external and local)
 * using the package_config.json file as source of truth.
 * @param searchStartPath Path from where to start searching for project root.
 * @returns An array of objects with information about all found packages.
 */
export function findAllPackages(searchStartPath: string): ExternalPackageInfo[] {
  log.debug(`\n--- [Debug] Starting findAllPackages ---`);
  const allPackages: ExternalPackageInfo[] = [];

  const projectRoot = findProjectRootWithPubspec(searchStartPath);
  
  if (!projectRoot) {
    log.debug('⚠️ [Debug] Project root with pubspec.yaml not found. Ending search.');
    return allPackages;
  }
  log.debug(`[Debug] Project root found at: ${projectRoot}`);
  
  const packageConfigPath = path.join(projectRoot, '.dart_tool', 'package_config.json');
  
  if (!fs.existsSync(packageConfigPath)) {
      log.debug(`⚠️ [Debug].dart_tool/package_config.json file not found. Cannot determine packages.`);
      return allPackages;
  }

  log.debug(`[Debug] Analyzing ${packageConfigPath}...`);
  try {
    const packageConfig = JSON.parse(fs.readFileSync(packageConfigPath, 'utf8'));
    
    if (packageConfig.packages && Array.isArray(packageConfig.packages)) {
      log.debug(`   -> Found ${packageConfig.packages.length} packages in file.`);

      for (const pkg of packageConfig.packages) {
        if (!pkg.name || !pkg.rootUri) {
          log.debug(`   -> Skipping package without name or rootUri: ${JSON.stringify(pkg)}`);
          continue;
        }
        
        log.debug(`\n   --- Processing package:  ${pkg.name} ---`);
        log.debug(`   original URI: ${pkg.rootUri}`);

        let packagePath: string;
        if (pkg.rootUri.startsWith('file://')) {
          packagePath = vscode.Uri.parse(pkg.rootUri).fsPath;
        } else {
          const dartToolDir = path.dirname(packageConfigPath);
          packagePath = path.resolve(dartToolDir, pkg.rootUri);
        }
        log.debug(` Resolved Path: ${packagePath}`);

        const packageInfo = analyzeExternalPackage(pkg.name, packagePath, pkg, projectRoot, );
        if (packageInfo) {
          allPackages.push(packageInfo);
          log.debug(`   -> Package added: ${packageInfo.name} (Type: ${packageInfo.type})`);
        }
      }
    }
  } catch (error) {
    log.error(`❌ [Debug]CRITICAL ERROR reading package_config.json`);
    if (error instanceof Error) {
        log.error(`   Mensaje: ${error.message}`);
    } else {
        log.error(`   Unknown error: ${String(error)}`);
    }
  }

  log.info(`\n[Debug] ✅ Search completed. Found ${allPackages.length} packages total (external and local)`);
  log.info(`--- [Debug] End of findAllPackages ---\n`);
  return allPackages;
}

