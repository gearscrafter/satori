// extension_lifecycle.ts
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { ProjectGraphModel } from '../types/index';
import { DetailsViewProvider } from './providers/details_provider';
import { findCustomDartDirectories } from '../filesystem/directory_scanner';
import { calculateDataFlow } from '../core';
import { extractPackageImportsFromFile } from '../packages/package_files';
import { createWebview } from './webview_creator';
import { log } from '../utils/logger';
import { registerDebugCommands } from './command_registry';
import { transformLspSymbols } from '../analysis/symbol_transformer';
import { t, Localization } from '../utils/localization';

/**
 * Manages the global state of the Satori extension.
 * 
 * Maintains references to the main architecture graph panel and the data model
 * of the analyzed project.
 */
class ExtensionState {
    mainGraphPanel: vscode.WebviewPanel | undefined;
    projectGraph: ProjectGraphModel | undefined;

    /**
     * Sets the webview panel and project graph in the global state.
     * 
     * @param panel - Webview panel that displays the graph visualization
     * @param graph - Graph data model with the project's nodes and edges
     */
    setGraph(panel: vscode.WebviewPanel, graph: ProjectGraphModel) {
        this.mainGraphPanel = panel;
        this.projectGraph = graph;
    }

    /**
     * Clears the global state, releasing references to the panel and graph.
     * Typically called when the visualization panel is closed.
     */
    clear() {
        this.mainGraphPanel = undefined;
        this.projectGraph = undefined;
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
    progress: vscode.Progress<{ increment: number; message: string }>
) {
    const root = rootUri.fsPath;
    log.debug(`🔍 Analyzing project at: ${root}`);
    log.debug(`📊 Root URI - scheme: ${rootUri.scheme}, fsPath: ${rootUri.fsPath}`);
    log.debug(`📊 Root URI - toString: ${rootUri.toString()}`);

    const isProjectRoot = fs.existsSync(path.join(root, 'pubspec.yaml'));
    log.debug(`📊 Is project root (has pubspec.yaml): ${isProjectRoot}`);

    progress.report({ increment: 10, message: t('progress.searchingFiles') });
    log.debug('📂 Searching files in standard directories...');
    
    const standardPatterns = isProjectRoot 
        ? [
            'lib/**/*.dart',
          ]
        : [
            '**/*.dart'
          ];

    log.debug(`📊 Using patterns: ${JSON.stringify(standardPatterns)}`);

    let uris: vscode.Uri[] = [];
    let totalFilesByPattern: { [pattern: string]: number } = {};
    
    for (const pattern of standardPatterns) {
        try {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootUri, pattern),
                '**/.dart_tool/**'
            );
            uris.push(...files);
            totalFilesByPattern[pattern] = files.length;
            log.debug(`  • Pattern '${pattern}': ${files.length} files`);
        } catch (error: any) {
            log.error(`  ❌ Error searching pattern '${pattern}': ${error.message}`);
            totalFilesByPattern[pattern] = 0;
        }
    }

    log.debug(`📊 Files found by pattern: ${JSON.stringify(totalFilesByPattern, null, 2)}`);

    progress.report({ increment: 20, message: t('progress.searchingCustomDirs') });
    
    let customDirectories: vscode.Uri[] = [];
    if (isProjectRoot) {
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
                const relativePath = path.relative(root, customDir.fsPath);
                log.debug(` • Custom directory  '${relativePath}': ${customFiles.length} files`);
            } catch (error: any) {
                log.error(`  ❌ Error in custom directory ${customDir.fsPath}: ${error.message}`);
            }
        }
    } else {
        log.debug(`📊 Skipping custom directory search (not in project root)`);
    }

    const uniqueUris = Array.from(new Set(uris.map(u => u.toString())))
        .map(uriString => vscode.Uri.parse(uriString));
    
    log.debug(`📄 Total unique files found: ${uniqueUris.length}`);
    
    if (uniqueUris.length === 0) {
        log.info('❌ No Dart files found in the project.');
        vscode.window.showWarningMessage('No Dart files found in the project. Please check your project structure.');
        return null;
    }

    log.debug(`📄 Sample of found files (first 5):`);
    uniqueUris.slice(0, 5).forEach((uri, idx) => {
        log.debug(`  ${idx + 1}. ${uri.fsPath}`);
    });

    progress.report({ increment: 30, message: t('progress.analyzingFiles', uniqueUris.length.toString()) });

    type FileData = { file: string; fileUri: string; symbols: any[] }; 
    const filesDataArray: FileData[] = []; 

    let analyzedCount = 0;
    let errorCount = 0;
    let emptyCount = 0;

    for (const u of uniqueUris) {
        let syms: any[] = []; 
        try {
            const raw = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                u
            ) as vscode.DocumentSymbol[] | null | undefined;
            
            if (raw === null) {
                log.debug(`[DIAGNOSTIC] Received NULL for ${path.basename(u.fsPath)}`);
                emptyCount++;
            } else if (raw === undefined) {
                log.debug(`[DIAGNOSTIC] Received UNDEFINED for ${path.basename(u.fsPath)}`);
                errorCount++;
            } else if (!Array.isArray(raw)) {
                log.debug(`[DIAGNOSTIC] Received non-array type for ${path.basename(u.fsPath)}: ${typeof raw}`);
                errorCount++;
            } else if (raw.length === 0) {
                emptyCount++;
            } else {
                analyzedCount++;
            }
            
            const rawSymbols = Array.isArray(raw) ? raw : [];
            syms = transformLspSymbols(rawSymbols as vscode.DocumentSymbol[], undefined, u.toString());
            
        } catch (e: any) {
            log.error(`⚠️ Error getting symbols for ${path.basename(u.fsPath)}: ${e.message}`);
            errorCount++;
        }
        
        filesDataArray.push({ file: u.fsPath, fileUri: u.toString(), symbols: syms });

        const progressIncrement = 40 / uniqueUris.length; 
        progress.report({ 
            increment: progressIncrement, 
            message: t('progress.analyzingFile') 
        });
    }

    log.debug(`📊 Analysis Summary:`);
    log.debug(`   ✅ Successfully analyzed: ${analyzedCount} files`);
    log.debug(`   📭 Empty results: ${emptyCount} files`);
    log.debug(`   ❌ Errors: ${errorCount} files`);
    log.debug(`   📦 Total files processed: ${filesDataArray.length}`);

    if (filesDataArray.every(f => f.symbols.length === 0) && filesDataArray.length > 0) {
        log.info('⚠️ No classes/symbols found in any project Dart files.');
        vscode.window.showWarningMessage('No classes or symbols found in the project. The diagram may be empty.');
    }  

    progress.report({ increment: 80, message: t('progress.buildingGraph') });

    log.debug(`📦 Preparing to create webview...`);
    log.debug(`📦 Project root for webview: ${root}`);
    log.debug(`📦 Total files for webview: ${filesDataArray.length}`);

    try {
        log.debug(`🚀 Calling createWebview function...`);
        
        const result = await createWebview(context, { 
            projectRoot: root, 
            files: filesDataArray 
        });

        const { panel, graph } = result;

        log.debug(`✅ Webview created successfully!`);
        log.debug(`📊 Graph stats: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);
        
        if (!graph.nodes || graph.nodes.length === 0) {
            log.error(`⚠️ WARNING: Graph has no nodes!`);
            vscode.window.showWarningMessage('The graph was created but contains no nodes. Check the logs for details.');
        }

        progress.report({ increment: 95, message: t('progress.configuringInterface') });
        
        return { panel, graph };
        
    } catch (error: any) {
        log.error(`❌ CRITICAL ERROR creating webview:`);
        log.error(`   Message: ${error.message}`);
        log.error(`   Stack: ${error.stack}`);
        
        vscode.window.showErrorMessage(`Failed to create visualization: ${error.message}`);
        return null;
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
 * - 'traceDataFlow': Calculates and visualizes the data flow
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
        async (message) => {
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
                    try {
                        const uri = vscode.Uri.parse(message.file);
                        const start = new vscode.Position(message.start.line, message.start.character);
                        const end = new vscode.Position(message.end.line, message.end.character);
                        const range = new vscode.Range(start, end);

                        const existingEditor = vscode.window.visibleTextEditors.find(e =>
                            e.document.uri.fsPath === uri.fsPath && e.viewColumn === vscode.ViewColumn.Two
                        );

                        if (existingEditor) {
                            existingEditor.selection = new vscode.Selection(start, end);
                            existingEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                        } else {
                            const doc = await vscode.workspace.openTextDocument(uri);
                            const editor = await vscode.window.showTextDocument(doc, {
                                viewColumn: vscode.ViewColumn.Two,
                                preview: true,
                                selection: range
                            });
                            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                        }
                    } catch (e) {
                        console.error(e);
                        log.error(`Could not open or read file: ${message.file}`);
                    }
                    return;

                case 'showRelationships':
                    if (message.data && currentGraph) {
                        const focusedNode = currentGraph.nodes.find(node => 
                            node.label === message.data.focusedNodeLabel || 
                            node.id === message.data.focusedNodeId
                        );
                        
                        detailsProvider.updateDetails({
                            ...message.data,
                            focusedNode: focusedNode
                        });
                    } else {
                        detailsProvider.updateDetails(message.data);
                    }
                    return;

                case 'getImports': {
                    if (!message.nodeId || !currentGraph || !currentPanel) return;

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

                case 'traceDataFlow': {
                    if (message.startNodeId && currentGraph && currentPanel) {
                        log.debug(`[Extension] Calculating data flow for: ${message.startNodeId}`);

                        const flowPath = calculateDataFlow(currentGraph, message.startNodeId);

                        log.debug(`[Extension] Path found: ${flowPath.join(' -> ')}`);

                        currentPanel.webview.postMessage({
                            command: 'displayDataFlow',
                            path: flowPath
                        });
                    }
                    return;
                }
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

    const analyzeCurrentProjectCommand = vscode.commands.registerCommand(
        'satori.analyzeProject',
        async () => {
            log.debug('========== EXECUTING satori.analyzeProject ==========');
            
            const rootUri = await findFlutterProjectRoot();
            
            if (!rootUri) {
                log.debug('❌ No Flutter project root found - ABORTING');
                return;
            }

            log.debug(`✅ Flutter project root confirmed: ${rootUri.fsPath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Satori",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: t('progress.starting') });
                
                log.debug(`🔄 Starting analysis process...`);
                const result = await analyzeProject(rootUri, context, progress);
                
                if (!result) {
                    log.debug('Analysis returned NULL - ABORTING');
                    vscode.window.showErrorMessage('Analysis failed. Check the Output panel (Satori) for details.');
                    return;
                }

                log.debug('Analysis complete! Setting up state and handlers...');
                
                state.setGraph(result.panel, result.graph);
                setupWebviewMessageHandlers(state, detailsProvider, context);
                
                progress.report({ increment: 100, message: t('progress.completed') });
                
                log.debug('========== satori.analyzeProject COMPLETED SUCCESSFULLY ==========');
            });
        }
    );

    log.info('Command satori.analyzeProject registered');
    context.subscriptions.push(analyzeCurrentProjectCommand);
    const showProjectDiagramCommand = vscode.commands.registerCommand(
        'extension.showProjectDiagram',
        async () => {
            log.debug('========== EXECUTING extension.showProjectDiagram ==========');
            
            const pick = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select project folder'
            });
            
            if (!pick?.length) {
                log.debug('No folder selected - ABORTING');
                return;
            }

            log.debug(`Folder selected: ${pick[0].fsPath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Satori",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: t('progress.starting') });
                
                log.debug(`🔄 Starting analysis process...`);
                const result = await analyzeProject(pick[0], context, progress);
                
                if (!result) {
                    log.debug('Analysis returned NULL - ABORTING');
                    vscode.window.showErrorMessage('Analysis failed. Check the Output panel (Satori) for details.');
                    return;
                }

                log.debug('Analysis complete! Setting up state and handlers...');
                
                state.setGraph(result.panel, result.graph);
                setupWebviewMessageHandlers(state, detailsProvider, context);
                
                progress.report({ increment: 100, message: t('progress.completed') });
                
                log.debug('🎉 ========== extension.showProjectDiagram COMPLETED SUCCESSFULLY ==========');
            });
        }
    );

    log.info('Command extension.showProjectDiagram registered');
    context.subscriptions.push(showProjectDiagramCommand);

    const originalResolveWebviewView = detailsProvider.resolveWebviewView.bind(detailsProvider);
    detailsProvider.resolveWebviewView = (webviewView, ...args) => {
        webviewView.webview.onDidReceiveMessage(async message => {
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