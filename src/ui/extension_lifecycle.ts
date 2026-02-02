import * as vscode from 'vscode';
import path from 'path';
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
 * Activates the Satori extension by registering commands for AST analysis 
 * and project diagrams, and configuring webview communication. Uses the existing 
 * Dart extension's language services for symbol analysis.
 * 
 * @param context - VS Code extension context with subscriptions and resources
 */
export async function activate(context: vscode.ExtensionContext,) {
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

    let mainGraphPanel: vscode.WebviewPanel | undefined;
    let projectGraph: ProjectGraphModel | undefined;

    const detailsProvider = new DetailsViewProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(DetailsViewProvider.viewType, detailsProvider)
    );

  const showProjectDiagramCommand =
    vscode.commands.registerCommand(
      'extension.showProjectDiagram',
      async () => {
        const pick = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select project folder'
        });
        if (!pick?.length) {
          log.debug('✋ No folder selected');
          return;
        }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Satori",
        cancellable: false
      }, async (progress, token) => {

        progress.report({ increment: 0, message: t('progress.starting') });
        
        const rootUri = pick[0]; 
        const root = rootUri.fsPath;
        log.debug(`🔍 Analyzing project at: ${root}`);

        progress.report({ increment: 10, message: t('progress.searchingFiles') });

        log.debug('📂 Searching files in standard directories...');
      
        const standardPatterns = [
          'lib/**/*.dart',
          'test/**/*.dart',
          'integration_test/**/*.dart',
          'example/**/*.dart',
          'tool/**/*.dart',
          'bin/**/*.dart'
        ];

        let uris: vscode.Uri[] = [];
        
        for (const pattern of standardPatterns) {
          const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootUri, pattern),
            '**/.dart_tool/**'
          );
          uris.push(...files);
          log.debug(`  • Pattern '${pattern}': ${files.length} files`);
        }

        progress.report({ increment: 20, message: t('progress.searchingCustomDirs') });
       
        
        const customDirectories = await findCustomDartDirectories(rootUri,);
        
        for (const customDir of customDirectories) {
          const customFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(customDir, '**/*.dart'),
            '**/.*' 
          );
          
          uris.push(...customFiles);
          const relativePath = path.relative(root, customDir.fsPath);
          log.debug(` • Custom directory  '${relativePath}': ${customFiles.length} files`);
        }

        const uniqueUris = Array.from(new Set(uris.map(u => u.toString())))
          .map(uriString => vscode.Uri.parse(uriString));
        
        log.debug(`📄 Total unique files found: ${uniqueUris.length}`);
        
        if (uniqueUris.length === 0) {
          log.info('No Dart files found in the project.');
          return;
        }

        progress.report({ increment: 30, message: t('progress.analyzingFiles', uniqueUris.length.toString()) });
    
        type FileData = { file: string; fileUri: string; symbols: any[] }; 

        const filesDataArray: FileData[] = []; 

        for (const u of uniqueUris) {
          let syms: any[] = []; 
          try {
            const raw = await vscode.commands.executeCommand(
              'vscode.executeDocumentSymbolProvider',
              u
            ) as vscode.DocumentSymbol[] | null;
             if (raw === null) {
                  log.debug(`[DIAGNOSTIC] Received NULL for ${u.fsPath}`);
              } else if (raw.length === 0) {
                  log.debug(`[DIAGNOSTIC] Received an EMPTY ARRAY for ${u.fsPath}`);
              }
            const rawSymbols = Array.isArray(raw) ? raw : [];
            syms = transformLspSymbols(rawSymbols as vscode.DocumentSymbol[], undefined, u.toString());
            log.debug(` • Analyzed: ${u.fsPath} → ${syms.length} top-level symbols. `);

            const DEBUG_SPECIFIC_FILE = false; 
            const FILE_TO_DEBUG = 'template.dart'; 

            if (DEBUG_SPECIFIC_FILE && u.fsPath.endsWith(FILE_TO_DEBUG)) {
                log.debug(`--- Detailed Symbols for ${u.fsPath} ---`);
                function logSymbolStructure(symbolsToLog: any[], indent: string) { 
                    if (!symbolsToLog) return;
                    symbolsToLog.forEach(s => {
                        log.debug(`${indent} Name: ${s.name}, Kind: ${s.kind}, Detail: '${s.detail}'`);
                        if (s.selectionRange) {
                            log.debug(`${indent}  Range: L${s.selectionRange.start.line}C${s.selectionRange.start.character}-L${s.selectionRange.end.line}C${s.selectionRange.end.character}`);
                        }
                        if (s.children && s.children.length > 0) {
                            log.debug(`${indent}  Children: (${s.children.length})`);
                            logSymbolStructure(s.children, indent + "    ");
                        }
                    });
                }
                logSymbolStructure(syms, "  "); 
                log.debug(`--- End Detailed Symbols for ${u.fsPath} ---`);
            }

          } catch (e: any) {
            log.error(`⚠️ Error getting symbols for ${u.fsPath}: ${e.message}`);
          }
          filesDataArray.push({ file: u.fsPath, fileUri: u.toString(), symbols: syms });

          const progressIncrement = 40 / uniqueUris.length; 
          progress.report({ 
            increment: progressIncrement, 
            message:t('progress.analyzingFile') 
          });
        }

                
        if (filesDataArray.every(f => f.symbols.length === 0) && filesDataArray.length > 0) {
          log.info('No classes/symbols found in the project Dart files.');
        }  

        progress.report({ increment: 80, message: t('progress.buildingGraph') });

        const { panel, graph } = await createWebview(context, { projectRoot: root, files: filesDataArray });

        progress.report({ increment: 95, message: t('progress.configuringInterface') });
        mainGraphPanel = panel;
        projectGraph = graph;
        
        if (mainGraphPanel) {
            mainGraphPanel.webview.onDidReceiveMessage(
                async (message) => {
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
                                const uri   = vscode.Uri.parse(message.file);
                                const start = new vscode.Position(message.start.line, message.start.character);
                                const end   = new vscode.Position(message.end.line,   message.end.character);
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
                            if (message.data && projectGraph) {
                                const focusedNode = projectGraph.nodes.find(node => 
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
                            if (!message.nodeId || !projectGraph || !mainGraphPanel) return;

                            log.debug(`[Backend] WebView requested imports for:${message.nodeId}`);

                            const focusNode = projectGraph.nodes.find(n => n.id === message.nodeId);
                            if (focusNode && focusNode.data.fileUri) {
                                const imports = extractPackageImportsFromFile(focusNode.data.fileUri);
                                
                                log.debug(`[Backend] Imports found: ${imports.join(', ')}. Sending to WebView.`);

                                mainGraphPanel.webview.postMessage({
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
                            if (message.startNodeId && projectGraph && mainGraphPanel) {
                                log.debug(`[Extension] Calculating data flow for: ${message.startNodeId}`);

                                const flowPath = calculateDataFlow(projectGraph, message.startNodeId);

                                log.debug(`[Extension] Path found: ${flowPath.join(' -> ')}`);

                                mainGraphPanel.webview.postMessage({
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
            }
            mainGraphPanel.onDidDispose(
                () => {
                    log.debug('Graph panel closed, clearing details.');
                    detailsProvider.clearDetails();
                },
                null,
                context.subscriptions
            );
        
          progress.report({ increment: 100, message: t('progress.completed') });
        }); 
    }  
  ); 
    log.info('Command extension.showProjectDiagram registered');
    context.subscriptions.push(showProjectDiagramCommand);

    const originalResolveWebviewView = detailsProvider.resolveWebviewView.bind(detailsProvider);
    detailsProvider.resolveWebviewView = (webviewView, ...args) => {
         webviewView.webview.onDidReceiveMessage( async message => {
            switch (message.command) {
                case 'log':
                    log.debug(`[DetailsView] ${message.args.join(' ')}`);
                    break;
                case 'focusNode':
                    if (mainGraphPanel) {
                        log.debug(`[Extension] Received 'focusNode' from DetailsView. Forwarding to graph.`);
                        mainGraphPanel.webview.postMessage({
                            command: 'setFocusInGraph',
                            nodeId: message.nodeId
                        });
                    } else {
                        log.debug(`[Extension] Error: Received 'focusNode' but graph panel is not open.`);
                    }
                    break;
                case 'highlightPath':
                    if (mainGraphPanel) {
                        log.debug(`[Extension] Forwarding 'highlightPath' to graph.`);
                        mainGraphPanel.webview.postMessage({
                            command: 'setPathHighlight', 
                            sourceId: message.sourceId,
                            targetId: message.targetId
                        });
                    }
                    break;
                case 'openFile': {

                      log.debug(`[Extension] message.file type: ${typeof message.file}, value: ${message.file}`);
                      log.debug(`[Extension] message.start type: ${typeof message.start}, value: ${JSON.stringify(message.start)}`);
                      log.debug(`[Extension] message.end type: ${typeof message.end}, value: ${JSON.stringify(message.end)}`);
   
                      if (!message.nodeId || !projectGraph) {
                          log.info(`Received openFile request without nodeId.`);
                          return;
                      }

                      const node = projectGraph.nodes.find(n => n.id === message.nodeId);
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
                          vscode.window.showErrorMessage(`No se pudo abrir el archivo: ${node.label}`);
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
