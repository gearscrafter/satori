import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DartAnalysisClient } from '../lsp/analysis_server';
import { realDartExecutable } from '../lsp/dart_executable';
import { findDartSdk } from '../lsp/dart_sdk';
import { NavigationIndex, normalizePath } from './navigation_index';
import { mapLimited } from '../core';
import { log } from '../utils/logger';
import { LoadingReporter, silentReporter } from '../ui/loading_state';
import { t } from '../utils/localization';

const REQUESTS_IN_FLIGHT = 8;
const ANALYSIS_TIMEOUT_MS = 20 * 60 * 1000;

export interface NavigationOutcome {
    index: NavigationIndex;
    files: number;
    startMs: number;
    analyzeMs: number;
    navigationMs: number;
}

/**
 * Asks Dart's analysis server where every identifier of the project points to, one request per file, and returns an
 * index that answers "where is this symbol used?" without further questions. Returns null whenever it cannot be done
 * (no Dart SDK, the server fails, a file cannot be read) so the caller falls back to asking the language server.
 */
export async function buildNavigationIndex(projectRoot: string, files: vscode.Uri[], reporter: LoadingReporter = silentReporter): Promise<NavigationOutcome | null> {
    const engine = vscode.workspace.getConfiguration('satori').get<string>('analysis.engine', 'auto');
    if (engine === 'languageServer') {
        log.info('Relationships are asked one by one to the language server (satori.analysis.engine).');
        reporter.finish('relations');
        return null;
    }

    const found = findDartSdk();
    if (!found) { reporter.finish('relations'); return null; }
    const dart = realDartExecutable(found, fs.existsSync);

    const client = new DartAnalysisClient(dart);
    try {
        reporter.start('relations', t('loading.relations.starting'));
        const t0 = Date.now();
        const version = await client.start();
        log.debug(`[Navigation] analysis server ${version} started with ${dart}`);
        const t1 = Date.now();
        reporter.start('relations', t('loading.relations.analyzing'));
        await client.analyze(path.resolve(projectRoot), ANALYSIS_TIMEOUT_MS);
        const t2 = Date.now();

        const projectFiles = new Set(files.map(u => normalizePath(u.fsPath)));
        const index = new NavigationIndex();
        await mapLimited(files, REQUESTS_IN_FLIGHT, async (uri) => {
            const text = fs.readFileSync(uri.fsPath, 'utf8');
            const result = await client.getNavigation(uri.fsPath, text.length);
            index.addFile(result, uri.toString(), text, p => projectFiles.has(normalizePath(p)), uri.fsPath);
        }, (done, total) => reporter.progress('relations', done, total, t('loading.relations.reading')));
        reporter.finish('relations');
        const t3 = Date.now();
        return { index, files: files.length, startMs: t1 - t0, analyzeMs: t2 - t1, navigationMs: t3 - t2 };
    } catch (error: any) {
        log.info(`The analysis server could not be used (${error.message}); asking the language server instead.`);
        reporter.finish('relations');
        return null;
    } finally {
        client.dispose();
    }
}
