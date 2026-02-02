import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { log } from '../utils/logger';

/**
 * Finds the Dart SDK executable path
 * Priority:
 * 1. User configured path in settings (satori.dartSdkPath)
 * 2. System PATH (which/where dart)
 * 3. Returns undefined if not found
 * 
 * @returns Path to dart executable or undefined if not found
 */
export function findDartSdk(): string | undefined {
  const cfg = vscode.workspace.getConfiguration('satori');
  const userPath = cfg.get<string>('dartSdkPath')?.trim();

  if (userPath) {
    log.debug(`Checking user configured path: ${userPath}`);

    if (fs.existsSync(userPath) && fs.statSync(userPath).isDirectory()) {
      const dartExecutable = path.join(userPath, 'bin', 'dart');
      if (fs.existsSync(dartExecutable)) {
        log.info(`✅ Found Dart SDK at configured path: ${userPath}`);
        return dartExecutable;
      }
    }

    if (fs.existsSync(userPath)) {
      log.info(`✅ Found Dart executable at configured path: ${userPath}`);
      return userPath;
    }

    log.debug(`Configured Dart SDK path not found: ${userPath}`);
  }

  try {
    const cmd = process.platform === 'win32' ? 'where dart' : 'which dart';
    const dartPath = execSync(cmd, { encoding: 'utf-8' }).toString().trim();

    if (dartPath && fs.existsSync(dartPath)) {
      log.info(`✅ Found Dart SDK in system PATH: ${dartPath}`);
      return dartPath;
    }
  } catch (error) {
    log.debug('Dart SDK not found in system PATH');
  }

  log.error('❌ Dart SDK not found');
  return undefined;
}