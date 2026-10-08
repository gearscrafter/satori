// extension_lifecycle.ts
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { ProjectGraphModel } from '../types/index';
import { ImportRef } from '../analysis/imports';
import { DetailsViewProvider } from './providers/details_provider';
import { findCustomDartDirectories } from '../filesystem/directory_scanner';
import { extractPackageImportsFromFile } from '../packages/package_files';
import { createWebview, saveAnnotations } from './webview_creator';
import { cacheFileFor, clearCachedAnalyses, fingerprintOf, readCachedAnalysis, stampFiles, writeCachedAnalysis } from '../analysis/graph_cache';
import { AnalysisStats, SymbolStats, isHealthy, likelyCauses, symbolsLookComplete } from '../analysis/analysis_health';
import { DEFAULT_EXCLUDES, makeExcluder } from '../filesystem/exclusions';
import { buildNavigationIndex } from '../analysis/navigation_runner';
import { findArchitectureFile } from '../analysis/architecture_file';
import { LoadingReporter, silentReporter } from './loading_state';
import { NotificationReporter } from './progress_reporter';
import { log } from '../utils/logger';
import { registerDebugCommands } from './command_registry';
import { transformLspSymbols } from '../analysis/symbol_transformer';
import { t, Localization } from '../utils/localization';
import { buildSnippet } from '../analysis/snippet';
import { mapLimited, retryUntil } from '../core';

/**
 * Manages the global state of the Satori extension.
 * 
 * Maintains references to the main architecture graph panel and the data model
 * of the analyzed project.
 */
class ExtensionState {
    mainGraphPanel: vscode.WebviewPanel | undefined;
    projectGraph: ProjectGraphModel | undefined;
    stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
    timings: Record<string, number | string> | undefined;

    /**
     * Sets the webview panel and project graph in the global state.
     *
     * @param panel - Webview panel that displays the graph visualization
     * @param graph - Graph data model with the project's nodes and edges
     */
    setGraph(panel: vscode.WebviewPanel, graph: ProjectGraphModel) {
        this.mainGraphPanel = panel;
        this.projectGraph = graph;
        this.stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
    }

    /**
     * Clears the global state, releasing references to the panel and graph.
     * Typically called when the visualization panel is closed.
     */
    clear() {
        this.mainGraphPanel = undefined;
        this.projectGraph = undefined;
        this.stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
    }

    /**
     * Gets the active webview panel of the graph.
     * 
     * @returns Webview panel if active, undefined otherwise
     */
    getPanel(): vscode.WebviewPanel | undefined {
        return this.mainGraphPanel;
    }

    /**
     * Gets the current project graph data model.
     * 
     * @returns Project graph model if available, undefined otherwise
     */
    getGraph(): ProjectGraphModel | undefined {
        return this.projectGraph;
    }
}

/**
 * Finds the Flutter project root by locating the pubspec.yaml file.
 * 
 * Examines all workspace folders looking for pubspec.yaml, which
 * identifies the root of a Flutter/Dart project. Shows appropriate error
 * messages if it cannot find a valid workspace or project.
 * 
 * @returns URI of the project root folder, or undefined if not found
 */
async function findFlutterProjectRoot(): Promise<vscode.Uri | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a Flutter project.');
        return undefined;
    }

    for (const folder of workspaceFolders) {
        const pubspecFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, 'pubspec.yaml'),
            '**/.*',
            1
        );
        
        if (pubspecFiles.length > 0) {
            log.debug(`✅ Found pubspec.yaml at: ${pubspecFiles[0].fsPath}`);
            log.debug(`📁 Project root: ${folder.uri.fsPath}`);

            return folder.uri;
        }
    }

    vscode.window.showErrorMessage('No Flutter project found. Make sure pubspec.yaml exists in your workspace.');
    return undefined;
}

type FileData = { file: string; fileUri: string; symbols: any[] };

/**
 * Finds the unique Dart files to analyze: `lib/` plus custom directories when
 * the folder is a project root, or every `.dart` file otherwise.
 */
async function discoverDartFiles(
    rootUri: vscode.Uri,
    isProjectRoot: boolean
): Promise<{ uris: vscode.Uri[]; leftOut: number }> {
    const root = rootUri.fsPath;
    const uris: vscode.Uri[] = [];
    const pattern = isProjectRoot ? 'lib/**/*.dart' : '**/*.dart';

    try {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootUri, pattern),
            '**/.dart_tool/**'
        );
        uris.push(...files);
        log.debug(`  • Pattern '${pattern}': ${files.length} files`);
    } catch (error: any) {
        log.error(`  ❌ Error searching pattern '${pattern}': ${error.message}`);
    }


    if (isProjectRoot) {
        let customDirectories: vscode.Uri[] = [];
        try {
            customDirectories = await findCustomDartDirectories(rootUri);
            log.debug(`🔍 Found ${customDirectories.length} custom directories`);
        } catch (error: any) {
            log.error(`❌ Error finding custom directories: ${error.message}`);
        }

        for (const customDir of customDirectories) {
            try {
                const customFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(customDir, '**/*.dart'),
                    '**/.*'
                );
                uris.push(...customFiles);
                log.debug(` • Custom directory '${path.relative(root, customDir.fsPath)}': ${customFiles.length} files`);
            } catch (error: any) {
                log.error(`  ❌ Error in custom directory ${customDir.fsPath}: ${error.message}`);
            }
        }
    } else {
        log.debug(`📊 Skipping custom directory search (not in project root)`);
    }

    const found = Array.from(new Set(uris.map(u => u.toString()))).map(s => vscode.Uri.parse(s));
    const patterns = vscode.workspace.getConfiguration('satori').get<string[]>('analysis.exclude', DEFAULT_EXCLUDES);
    const isExcluded = makeExcluder(patterns);
    const uniqueUris = found.filter(u => !isExcluded(path.relative(root, u.fsPath)));
    if (uniqueUris.length < found.length) {
        log.info(`Left out ${found.length - uniqueUris.length} of ${found.length} Dart files that match satori.analysis.exclude (generated code by default).`);
    }
    log.debug(`📄 Total unique files found: ${uniqueUris.length}`);
    return { uris: uniqueUris, leftOut: found.length - uniqueUris.length };
}

/**
 * Requests document symbols from the Dart language server for each file and
 * transforms them into the extension's symbol model.
 *
 * Files are read a few at a time, and an empty answer is asked again after a short wait: while the
 * server is still starting it answers "nothing" for files that do declare classes, which would
 * silently drop them from the diagram.
 */
async function extractFileSymbols(
    uris: vscode.Uri[],
    reporter: LoadingReporter = silentReporter
): Promise<{ files: FileData[]; stats: SymbolStats }> {
    let analyzedCount = 0;
    let errorCount = 0;
    let emptyCount = 0;
    let emptyStreak = 0;
    const hasSymbols = (r: vscode.DocumentSymbol[] | null | undefined) => Array.isArray(r) && r.length > 0;

    reporter.start('symbols');
    const filesData = await mapLimited(uris, SYMBOL_REQUEST_CONCURRENCY, async (u): Promise<FileData> => {
        let syms: any[] = [];
        try {
            const ask = async () => await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                u
            ) as vscode.DocumentSymbol[] | null | undefined;
            // A file with no declarations is legitimate, so give up retrying once several in a row stay empty.
            const delays = emptyStreak >= MAX_EMPTY_FILES_IN_A_ROW ? [] : EMPTY_SYMBOLS_RETRY_DELAYS_MS;
            const outcome = await retryUntil(ask, hasSymbols, delays);
            emptyStreak = outcome.exhausted ? emptyStreak + 1 : 0;
            const raw = outcome.result;

            if (!Array.isArray(raw)) {
                log.debug(`[DIAGNOSTIC] No symbol array for ${path.basename(u.fsPath)}: ${raw === null ? 'null' : typeof raw}`);
                if (raw === null) { emptyCount++; } else { errorCount++; }
            } else if (raw.length === 0) {
                emptyCount++;
            } else {
                analyzedCount++;
            }

            syms = transformLspSymbols(Array.isArray(raw) ? raw : [], undefined, u.toString());
        } catch (e: any) {
            log.error(`⚠️ Error getting symbols for ${path.basename(u.fsPath)}: ${e.message}`);
            errorCount++;
        }

        return { file: normalizePath(u.fsPath), fileUri: u.toString(), symbols: syms };
    }, (done, total) => reporter.progress('symbols', done, total));
    reporter.finish('symbols');

    log.debug(`📊 Analysis Summary: ${analyzedCount} analyzed, ${emptyCount} empty, ${errorCount} errors, ${filesData.length} total`);
    return { files: filesData, stats: { files: filesData.length, withSymbols: analyzedCount, errors: errorCount } };
}

const SYMBOL_REQUEST_CONCURRENCY = 8;
const EMPTY_SYMBOLS_RETRY_DELAYS_MS = [250, 750];
const MAX_EMPTY_FILES_IN_A_ROW = 6;

/**
 * Analyzes a Flutter/Dart project and generates the architecture graph.
 * 
 * Executes the complete analysis process: searches for Dart files in standard
 * directories (lib/, test/, etc.) and custom ones, extracts symbols via the
 * Dart LSP, transforms the data, and generates the graph visualization.
 * 
 * Automatically adapts based on context:
 * - If in the project root (has pubspec.yaml): searches in specific directories
 * - If in a subfolder: searches all .dart files recursively
 * 
 * @param rootUri - URI of the root folder to analyze
 * @param context - Extension context for managing resources
 * @param progress - Progress indicator to report status to the user
 * @returns Object with the webview panel and generated graph, or null if it fails
 */
async function analyzeProject(
    rootUri: vscode.Uri, 
    context: vscode.ExtensionContext, 
    progress: vscode.Progress<{ increment: number; message: string }>,
    fresh = false
) {
    const root = rootUri.fsPath;
    log.debug(`🔍 Analyzing project at: ${root}`);
    log.debug(`📊 Root URI - scheme: ${rootUri.scheme}, fsPath: ${rootUri.fsPath}`);
    log.debug(`📊 Root URI - toString: ${rootUri.toString()}`);

    const isProjectRoot = fs.existsSync(path.join(root, 'pubspec.yaml'));
    log.debug(`📊 Is project root (has pubspec.yaml): ${isProjectRoot}`);

    const analysisStart = Date.now();
    // The notification at the bottom right shows each step, its counter, the percentage and the elapsed time.
    const loading = new NotificationReporter(progress, {
        labels: {
            files: t('loading.phase.files'),
            symbols: t('loading.phase.symbols'),
            relations: t('loading.phase.relations'),
            types: t('loading.phase.types'),
            graph: t('loading.phase.graph'),
            draw: t('loading.phase.draw')
        },
        elapsed: t('loading.elapsed')
    });
    try {
        return await analyzeFiles(rootUri, context, loading, fresh);
    } finally {
        loading.release();
    }
}

/**
 * Says that the analysis found less than the project has, why that probably happened and what to do: writes the
 * reasons to the "satori" output and offers to analyse again (which ignores the saved analysis).
 */
function reportIncompleteAnalysis(stats: AnalysisStats, root: string, isProjectRoot: boolean, leftOut: number): void {
    const causes = likelyCauses({
        files: stats.files,
        withSymbols: stats.withSymbols,
        isProjectRoot,
        hasPackageConfig: fs.existsSync(path.join(root, '.dart_tool', 'package_config.json')),
        dartExtensionActive: vscode.extensions.getExtension('Dart-Code.dart-code')?.isActive === true,
        workspaceTrusted: vscode.workspace.isTrusted,
        leftOutBySatori: leftOut
    });
    log.info(`⚠️ ${t('health.warning', String(stats.withSymbols), String(stats.files), String(stats.classes))}`);
    log.info(t('health.causesTitle'));
    causes.forEach(c => log.info(`  - ${t('health.cause.' + c.id, ...c.args)}`));

    const retry = t('health.action.retry');
    const details = t('health.action.details');
    void vscode.window.showWarningMessage(t('health.warning', String(stats.withSymbols), String(stats.files), String(stats.classes)), retry, details).then(choice => {
        if (choice === retry) { void vscode.commands.executeCommand('satori.reanalyze'); }
        else if (choice === details) { log.show(); }
    });
}

const SECOND_CHANCE_WAIT_MS = 8000;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function analyzeFiles(rootUri: vscode.Uri, context: vscode.ExtensionContext, loading: LoadingReporter, fresh: boolean) {
    const root = rootUri.fsPath;
    const isProjectRoot = fs.existsSync(path.join(root, 'pubspec.yaml'));
    const analysisStart = Date.now();
    loading.start('files');
    const { uris: uniqueUris, leftOut } = await discoverDartFiles(rootUri, isProjectRoot);
    const discoveredAt = Date.now();
    loading.finish('files');

    if (uniqueUris.length === 0) {
        log.info('❌ No Dart files found in the project.');
        vscode.window.showWarningMessage('No Dart files found in the project. Please check your project structure.');
        return null;
    }

    log.debug(`📄 Sample of found files (first 5):`);
    uniqueUris.slice(0, 5).forEach((uri, idx) => {
        log.debug(`  ${idx + 1}. ${uri.fsPath}`);
    });

    // The same files give the same graph: when nothing changed since the last analysis the saved one is used.
    const useCache = vscode.workspace.getConfiguration('satori').get<boolean>('cache.enabled', true);
    const extensionVersion = String(context.extension.packageJSON.version);
    const cacheFile = cacheFileFor(context.globalStorageUri.fsPath, normalizePath(root));
    // satori.json decides the layer of every class, so changing it must analyse again.
    const architectureFile = findArchitectureFile(root);
    const fingerprint = fingerprintOf(stampFiles([...uniqueUris.map(u => u.fsPath), ...(architectureFile ? [architectureFile] : [])]));
    const cached = useCache && !fresh ? readCachedAnalysis<ProjectGraphModel, Record<string, ImportRef[]>>(cacheFile, fingerprint, extensionVersion) : null;

    if (cached) {
        const result = await createWebview(context, {
            projectRoot: normalizePath(root),
            files: [],
            cached: { graph: cached.graph, fileImports: cached.fileImports },
            reporter: loading
        });
        const timings = {
            files: uniqueUris.length,
            discoverMs: discoveredAt - analysisStart,
            symbolsMs: 0,
            ...result.timings,
            totalMs: Date.now() - analysisStart
        };
        log.info('⏱ Opened ' + timings.files + ' files from the saved analysis in ' + (timings.totalMs / 1000).toFixed(1) + 's (saved ' + new Date(cached.savedAt).toLocaleString() + '; turn off with satori.cache.enabled)');
        return { panel: result.panel, graph: result.graph, timings };
    }


    const navigation = buildNavigationIndex(root, uniqueUris, loading);

    let extraction = await extractFileSymbols(uniqueUris, loading);
    if (!symbolsLookComplete(extraction.stats)) {
        // Most files answered "no symbols". Almost always Dart's server is still starting: wait a moment and ask
        // again, only about the files that came back empty, before giving the result as final.
        log.info(`Only ${extraction.stats.withSymbols} of ${extraction.stats.files} files returned symbols; waiting for the Dart server and asking again.`);
        loading.start('symbols', t('loading.symbols.waiting'));
        await sleep(SECOND_CHANCE_WAIT_MS);
        const empty = new Set(extraction.files.filter(f => f.symbols.length === 0).map(f => f.fileUri));
        const again = await extractFileSymbols(uniqueUris.filter(u => empty.has(u.toString())), loading);
        const byUri = new Map(again.files.map(f => [f.fileUri, f]));
        const merged = extraction.files.map(f => byUri.get(f.fileUri) ?? f);
        extraction = { files: merged, stats: { files: merged.length, withSymbols: merged.filter(f => f.symbols.length > 0).length, errors: again.stats.errors } };
    }
    const filesDataArray = extraction.files;
    const symbolStats = extraction.stats;
    const symbolsAt = Date.now();


    log.debug(`📦 Preparing to create webview...`);
    log.debug(`📦 Project root for webview: ${root}`);
    log.debug(`📦 Total files for webview: ${filesDataArray.length}`);

    try {
        log.debug(`🚀 Calling createWebview function...`);
        
        const result = await createWebview(context, { 
            projectRoot: normalizePath(root),
            files: filesDataArray,
            navigation,
            reporter: loading
        });

        const { panel, graph } = result;
        const timings = {
            files: filesDataArray.length,
            discoverMs: discoveredAt - analysisStart,
            symbolsMs: symbolsAt - discoveredAt,
            ...result.timings,
            totalMs: Date.now() - analysisStart
        };
        log.info(`⏱ Analysis of ${timings.files} files took ${(timings.totalMs / 1000).toFixed(1)}s ` +
            `(find files ${timings.discoverMs}ms, symbols ${timings.symbolsMs}ms, enrichment ${timings.enrichMs}ms, ` +
            `graph ${timings.graphMs}ms, page ${timings.finishMs}ms)`);

        const stats: AnalysisStats = { ...symbolStats, classes: (graph.nodes ?? []).filter(n => n.kind === 'class').length };
        if (isHealthy(stats)) {
            if (useCache) {
                // After the page is on screen: serialising a big graph takes a moment and nobody waits for it.
                setTimeout(() => {
                    try {
                        writeCachedAnalysis(cacheFile, fingerprint, extensionVersion, graph, result.fileImports, stats);
                        log.info(`💾 Analysis saved for the next time (${cacheFile})`);
                    } catch (e: any) {
                        log.error(`Could not save the analysis: ${e.message}`);
                    }
                }, 0);
            }
        } else {
            // An incomplete analysis is shown but never saved: reopening the project would repeat it.
            reportIncompleteAnalysis(stats, root, isProjectRoot, leftOut);
        }

        log.debug(`✅ Webview created successfully!`);
        log.debug(`📊 Graph stats: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);
        
        if (!graph.nodes || graph.nodes.length === 0) {
            log.error(`⚠️ WARNING: Graph has no nodes!`);
        }

        
        return { panel, graph, timings };

    } catch (error: any) {
        log.error(`❌ CRITICAL ERROR creating webview:`);
        log.error(`   Message: ${error.message}`);
        log.error(`   Stack: ${error.stack}`);
        
        vscode.window.showErrorMessage(`Failed to create visualization: ${error.message}`);
        return null;
    }
}

type LspPosition = { line: number; character: number };

/** Messages the graph webview sends to the extension. */
type GraphWebviewMessage =
    | { command: 'log'; args: unknown[] }
    | { command: 'openClass'; file?: string; start?: LspPosition; end?: LspPosition }
    | { command: 'ready' }
    | { command: 'reanalyze' }
    | { command: 'saveAnnotations'; projectRoot: string; data: Record<string, unknown> }
    | { command: 'getSnippet'; requestId: number; reveal?: boolean; nodeId?: string; sourceId?: string; targetId?: string;
        fileUri?: string; line?: number; column?: number; length?: number }
    | { command: 'showRelationships'; data: { focusedNodeLabel: string; focusedNodeId?: string; edges: any[] } | null }
    | { command: 'getImports'; nodeId?: string }
    | { command: 'clearRelationships' };

/** Messages the details side view sends to the extension. */
type DetailsWebviewMessage =
    | { command: 'log'; args: unknown[] }
    | { command: 'focusNode'; nodeId: string }
    | { command: 'highlightPath'; sourceId: string; targetId: string }
    | { command: 'openFile'; nodeId?: string };

/**
 * Shows a range of a file in the editor beside the graph. With `preserveFocus`
 * the graph keeps keyboard focus, so navigating the trail does not steal it.
 */
async function revealInEditor(file: string, start: LspPosition, end: LspPosition, preserveFocus = false) {
    try {
        const uri = vscode.Uri.parse(file);
        const startPos = new vscode.Position(start.line, start.character);
        const endPos = new vscode.Position(end.line, end.character);
        const range = new vscode.Range(startPos, endPos);

        const existingEditor = vscode.window.visibleTextEditors.find(e =>
            e.document.uri.fsPath === uri.fsPath && e.viewColumn === vscode.ViewColumn.Two
        );

        if (existingEditor) {
            existingEditor.selection = new vscode.Selection(startPos, endPos);
            existingEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            return;
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Two,
            preview: true,
            preserveFocus,
            selection: range
        });
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (e) {
        log.error(`Could not open or read file: ${file} (${e instanceof Error ? e.message : String(e)})`);
    }
}

/**
 * Sets up message handlers for bidirectional communication between the
 * webview and the extension.
 * 
 * Registers listeners for webview commands such as:
 * - 'openClass': Opens files in the editor with navigation to symbols
 * - 'showRelationships': Updates the side details panel with relationships
 * - 'getImports': Extracts and sends imports from a file
 * - 'log': Logs debug messages from the webview
 * 
 * Also handles state cleanup when the panel is closed.
 * 
 * @param state - Global extension state
 * @param detailsProvider - Details view panel provider
 * @param context - Extension context for subscriptions
 */
function setupWebviewMessageHandlers(
    state: ExtensionState,
    detailsProvider: DetailsViewProvider,
    context: vscode.ExtensionContext
) {
    const panel = state.getPanel();
    const graph = state.getGraph();
    
    if (!panel || !graph) {
        log.error('Cannot setup webview handlers: panel or graph is undefined');
        return;
    }

    log.debug('Setting up webview message handlers...');
    log.debug(`📊 Graph stats for handlers: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);

    panel.webview.onDidReceiveMessage(
        async (message: GraphWebviewMessage) => {
            const currentGraph = state.getGraph();
            const currentPanel = state.getPanel();

            switch (message.command) {
                case 'log':
                    log.debug(`[WebView] ${message.args.join(' ')}`);
                    return;


                case 'openClass':
                    if (!message.file || !message.start || !message.end) {
                        log.info(`Received openClass request without required file data.`);
                        return;
                    }
                    await revealInEditor(message.file, message.start, message.end);
                    return;

                case 'ready':
                    state.stats.webviewReady = true;
                    return;

                case 'reanalyze':
                    void vscode.commands.executeCommand('satori.reanalyze');
                    return;

                case 'saveAnnotations':
                    if (typeof message.projectRoot === 'string' && message.data && typeof message.data === 'object') {
                        await saveAnnotations(context.workspaceState, message.projectRoot, message.data);
                        state.stats.annotationSaves++;
                    }
                    return;

                case 'getSnippet': {
                    if (!currentGraph || !currentPanel) { return; }
                    const snippet = buildSnippet(currentGraph, message);
                    state.stats.snippetsServed++;
                    currentPanel.webview.postMessage({ command: 'snippet', requestId: message.requestId, snippet });
                    if (snippet && message.reveal) {
                        await revealInEditor(snippet.file, snippet.jump.start, snippet.jump.end, true);
                    }
                    return;
                }

                case 'showRelationships':
                    {
                        state.stats.relationshipUpdates++;
                        const data = message.data;
                        if (data && currentGraph) {
                            const focusedNode = currentGraph.nodes.find(node =>
                                node.label === data.focusedNodeLabel ||
                                node.id === data.focusedNodeId
                            );
                            detailsProvider.updateDetails({ ...data, focusedNode });
                        } else {
                            detailsProvider.updateDetails(data);
                        }
                    }
                    return;

                case 'getImports': {
                    if (!message.nodeId || !currentGraph || !currentPanel) {return;}

                    log.debug(`[Backend] WebView requested imports for:${message.nodeId}`);

                    const focusNode = currentGraph.nodes.find(n => n.id === message.nodeId);
                    if (focusNode && focusNode.data.fileUri) {
                        const imports = extractPackageImportsFromFile(focusNode.data.fileUri);
                        
                        log.debug(`[Backend] Imports found: ${imports.join(', ')}. Sending to WebView.`);

                        currentPanel.webview.postMessage({
                            command: 'displayImports',
                            nodeId: message.nodeId,
                            imports: imports
                        });
                    } else {
                        log.debug(`[Backend] ⚠️ Could not find node or its fileUri for ${message.nodeId}`);
                    }
                    return;
                }

                case 'clearRelationships':
                    detailsProvider.clearDetails();
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    panel.onDidDispose(
        () => {
            log.debug('Graph panel closed, clearing details and state.');
            detailsProvider.clearDetails();
            state.clear();
        },
        null,
        context.subscriptions
    );

    log.debug('✅ Webview message handlers setup complete');
}

/**
 * Activates the Satori extension by registering commands and configuring services.
 * 
 * Main entry point that:
 * 1. Verifies the presence of the Dart extension
 * 2. Loads translations according to user configuration
 * 3. Registers analysis commands (automatic and manual)
 * 4. Configures view providers and webview communication
 * 
 * Registered commands:
 * - 'satori.analyzeProject': Automatically analyzes the current project
 * - 'extension.showProjectDiagram': Allows manual folder selection
 * 
 * @param context - VS Code extension context with subscriptions and resources
 */
export async function activate(context: vscode.ExtensionContext) {
    function getLanguage(): string {
        const config = vscode.workspace.getConfiguration('satori');
        return config.get('language', 'en');
    }
    
    log.debug('🚀 Satori: starting…');
    const language = getLanguage();
    await Localization.getInstance().loadTranslations(context.extensionPath, language);
    
    const dartExtension = vscode.extensions.getExtension('Dart-Code.dart-code');
    if (!dartExtension || !dartExtension.isActive) {
        vscode.window.showErrorMessage(
            'Dart extension is required for Satori to work properly.'
        );
        return;
    }

    log.debug('Dart extension detected, using existing language services');

    registerDebugCommands(context);

    const state = new ExtensionState();

    const detailsProvider = new DetailsViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DetailsViewProvider.viewType, detailsProvider)
    );

    const runAnalysis = (rootUri: vscode.Uri, fresh = false) =>
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Satori",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: t('progress.starting') });

            const result = await analyzeProject(rootUri, context, progress, fresh);

            if (!result) {
                log.debug('Analysis returned NULL - ABORTING');
                vscode.window.showErrorMessage('Analysis failed. Check the Output panel (Satori) for details.');
                return;
            }

            state.setGraph(result.panel, result.graph);
            state.timings = result.timings;
            setupWebviewMessageHandlers(state, detailsProvider, context);

            progress.report({ increment: 100, message: t('progress.completed') });
            log.debug('Analysis completed successfully');
        });

    const analyzeCurrentProjectCommand = vscode.commands.registerCommand(
        'satori.analyzeProject',
        async () => {
            const rootUri = await findFlutterProjectRoot();
            if (!rootUri) {
                log.debug('No Flutter project root found - ABORTING');
                return;
            }
            await runAnalysis(rootUri);
        }
    );
    log.info('Command satori.analyzeProject registered');
    context.subscriptions.push(analyzeCurrentProjectCommand);

    // The way out of a saved analysis that is wrong or out of date: analyse again without it.
    context.subscriptions.push(vscode.commands.registerCommand('satori.reanalyze', async () => {
        const rootUri = await findFlutterProjectRoot();
        if (!rootUri) { return; }
        await runAnalysis(rootUri, true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('satori.clearCache', () => {
        const removed = clearCachedAnalyses(context.globalStorageUri.fsPath);
        log.info(`Saved analyses removed: ${removed}`);
        void vscode.window.showInformationMessage(t('cache.cleared', String(removed)));
    }));

    const showProjectDiagramCommand = vscode.commands.registerCommand(
        'extension.showProjectDiagram',
        async () => {
            const pick = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select project folder'
            });
            if (!pick?.length) {
                log.debug('No folder selected - ABORTING');
                return;
            }
            await runAnalysis(pick[0]);
        }
    );
    log.info('Command extension.showProjectDiagram registered');
    context.subscriptions.push(showProjectDiagramCommand);

    const originalResolveWebviewView = detailsProvider.resolveWebviewView.bind(detailsProvider);
    detailsProvider.resolveWebviewView = (webviewView, ...args) => {
        webviewView.webview.onDidReceiveMessage(async (message: DetailsWebviewMessage) => {
            switch (message.command) {
                case 'log':
                    log.debug(`[DetailsView] ${message.args.join(' ')}`);
                    break;
                case 'focusNode':
                    const currentPanel = state.getPanel();
                    if (currentPanel) {
                        log.debug(`[Extension] Received 'focusNode' from DetailsView. Forwarding to graph.`);
                        currentPanel.webview.postMessage({
                            command: 'setFocusInGraph',
                            nodeId: message.nodeId
                        });
                    } else {
                        log.debug(`[Extension] Error: Received 'focusNode' but graph panel is not open.`);
                    }
                    break;
                case 'highlightPath':
                    const panelForPath = state.getPanel();
                    if (panelForPath) {
                        log.debug(`[Extension] Forwarding 'highlightPath' to graph.`);
                        panelForPath.webview.postMessage({
                            command: 'setPathHighlight', 
                            sourceId: message.sourceId,
                            targetId: message.targetId
                        });
                    }
                    break;
                case 'openFile': {
                    const currentGraph = state.getGraph();
                    if (!message.nodeId || !currentGraph) {
                        log.info(`Received openFile request without nodeId or graph not loaded.`);
                        return;
                    }

                    const node = currentGraph.nodes.find(n => n.id === message.nodeId);
                    if (!node || !node.data.fileUri) {
                        log.error(`Could not find node or file URI for id: ${message.nodeId}`);
                        return;
                    }

                    try {
                        const uri = vscode.Uri.parse(node.data.fileUri);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        
                        await vscode.window.showTextDocument(doc, {
                            viewColumn: vscode.ViewColumn.Two,
                            preview: false,
                            preserveFocus: false
                        });
                        
                        log.debug(`Successfully opened file: ${node.data.fileUri}`);
                    } catch (error) {
                        log.error(`Error opening file ${node.data.fileUri}: ${error}`);
                        vscode.window.showErrorMessage(`Could not open file: ${node.label}`);
                    }
                    return;
                }
            }
        });
        return originalResolveWebviewView(webviewView, ...args);
    };

    return {
        getGraph: () => state.getGraph(),
        getStats: () => ({ ...state.stats, timings: state.timings }),
        focusNode: (nodeId: string) => state.getPanel()?.webview.postMessage({ command: 'setFocusInGraph', nodeId })
    };
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Deactivates the extension by safely stopping the LSP client.
 * Cleanup function that runs when the extension is closed.
 * 
 * @returns Promise that resolves when deactivation is complete
 */
export function deactivate(): Thenable<void> | undefined {
    return Promise.resolve();
}