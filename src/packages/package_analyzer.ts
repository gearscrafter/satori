import { ExternalPackageInfo, PackageType } from "../types/index";
import * as fs from 'fs';
import path from "path";
import { findDartFilesInPackage } from "./package_files";
import { log } from "../utils/logger";
import { findProjectRootWithPubspec } from "../filesystem/pattern_matcher";

/**
 * Analyzes an external package and extracts relevant information
 * @param packageName Package name
 * @param packagePath Path to the package
 * @param rawData Raw package data
 * @returns Structured package information or null if not valid
 */
export function analyzeExternalPackage(
  packageName: string,
  packagePath: string,
  rawData: any,
  projectRootPath?: string,
): ExternalPackageInfo | null {
  
  log.debug(` -> Analyzing details of package '${packageName}'...`);
  
  if (!fs.existsSync(packagePath)) {
    log.debug(`    -> ERROR: Package path does not exist: ${packagePath}`);
    return null;
  }

  try {
    const packageInfo: ExternalPackageInfo = {
      name: packageName,
      path: packagePath,
      version: rawData.version || 'unknown',
      type: determinePackageType(packageName, packagePath, projectRootPath, ),
      dartFiles: [],
      hasLibFolder: false,
      isFlutterPackage: false,
      description: ''
    };

    log.debug(`    -> Classified as: '${packageInfo.type}'`);

    const libPath = path.join(packagePath, 'lib');
    packageInfo.hasLibFolder = fs.existsSync(libPath);

    const packagePubspecPath = path.join(packagePath, 'pubspec.yaml');
    if (fs.existsSync(packagePubspecPath)) {
      try {
        const pubspecContent = fs.readFileSync(packagePubspecPath, 'utf8');
        packageInfo.isFlutterPackage = pubspecContent.includes('sdk: flutter');
        
        const descMatch = pubspecContent.match(/description:\s*(.+)/);
        if (descMatch) {
          packageInfo.description = descMatch[1].trim().replace(/['"]/g, '');
        }
      } catch (e) {
        log.debug(`    -> INFO: Could not read pubspec.yaml for package ${packageName}.`);
      }
    }

    if (packageInfo.hasLibFolder) {
      packageInfo.dartFiles = findDartFilesInPackage(libPath);
      log.debug(`    -> Found ${packageInfo.dartFiles.length} .dart files in its 'lib' folder.`);
    }

    return packageInfo;

  } catch (error) {
    log.error(`❌ CRITICAL ERROR analyzing package ${packageName}:`);
    if (error instanceof Error) {
        log.error(`   Mensaje: ${error.message}`);
    } else {
        log.error(`   Unknown error: ${String(error)}`);
    }
    return null;
  }
}

/**
 * Determines package type based on its name, location and relationship
 * with the project. Classifies as custom, flutter_official, sdk, or third_party
 * by analyzing the project's pubspec.yaml and known name patterns.
 * 
 * @param packageName - Name of the package to classify
 * @param packagePath - Physical path of the package
 * @param projectRootPath - Project root path (optional)
 * @returns Classified package type
 */
export function determinePackageType(packageName: string, packagePath: string, projectRootPath?: string,): PackageType {
  
  let actualProjectRoot: string | null = projectRootPath || null;
  if (!actualProjectRoot) {
    actualProjectRoot = findProjectRootWithPubspec(packagePath) || findProjectRootWithPubspec(process.cwd());
  }
  
  if (actualProjectRoot && packagePath.startsWith(actualProjectRoot)) {
    return 'custom';
  }

  if (actualProjectRoot) {
    try {
      const mainPubspecPath = path.join(actualProjectRoot, 'pubspec.yaml');
      if (fs.existsSync(mainPubspecPath)) {
        const pubspecContent = fs.readFileSync(mainPubspecPath, 'utf8');
        
        const pathDependencyRegex = new RegExp(`${packageName}:\\s*\\n\\s*path:\\s*`, 'm');
        if (pathDependencyRegex.test(pubspecContent)) {
          return 'custom';
        }

        const devDependencyRegex = new RegExp(`dev_dependencies:[\\s\\S]*?${packageName}:\\s*`, 'm');
        if (devDependencyRegex.test(pubspecContent)) {
          return 'custom';
        }
      }
    } catch (error) {
      log.error(`[Debug] Error leyendo pubspec.yaml principal: ${error}`);
    }
  }

  const flutterOfficialPackages = [
    'flutter', 'flutter_test', 'flutter_web_plugins', 'flutter_driver',
    'integration_test', 'flutter_localizations', 'material', 'cupertino'
  ];
  if (flutterOfficialPackages.includes(packageName) || packageName.startsWith('flutter_')) {
    return 'flutter_official';
  }

  if (packagePath.includes('dart-sdk') || packagePath.includes('flutter/bin/cache/dart-sdk')) {
    return 'sdk';
  }

  return 'third_party';
}
