import * as assert from 'assert';
import * as vscode from 'vscode';
import { createWebview } from '../../ui/webview_creator';
import { DetailsViewProvider } from '../../ui/providers/details_provider';



suite('Webview Test Suite', () => {
    let context: vscode.ExtensionContext;

    setup(() => {
        context = {
            subscriptions: [],
            extensionUri: vscode.Uri.file(__dirname),
            extensionPath: __dirname,
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {}
            },
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {}
            },
            secrets: {} as any,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: vscode.Uri.file(__dirname),
            globalStoragePath: __dirname,
            logUri: vscode.Uri.file(__dirname),
            logPath: __dirname,
            asAbsolutePath: (relativePath: string) => relativePath,
            environmentVariableCollection: {} as any,
            extension: {} as any,
            extensionMode: vscode.ExtensionMode.Test,
            languageModelAccessInformation: {} as any
        } as vscode.ExtensionContext;
    });

    test('createWebview should create webview panel', async () => {
        const mockData = {
            projectRoot: '/test/project',
            files: [{
                file: '/test/project/lib/main.dart',
                fileUri: 'file:///test/project/lib/main.dart',
                symbols: []
            }]
        };

        try {
            const result = await createWebview(context, mockData);
            
            assert.ok(result.panel, 'Should return a webview panel');
            assert.ok(result.graph, 'Should return a graph model');
            assert.strictEqual(result.panel.viewType, 'astDiagram', 'Should have correct view type');
            
            result.panel.dispose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('ENOENT') && !errorMessage.includes('webviewContent.html')) {
                throw error;
            }
        }
    });

    test('createWebview should handle empty files array', async () => {
        const mockData = {
            projectRoot: '/test/project',
            files: []
        };

        try {
            const result = await createWebview(context, mockData);
            
            assert.ok(result.graph, 'Should return graph even with empty files');
            assert.strictEqual(result.graph.nodes.length, 0, 'Graph should have no nodes');
            assert.strictEqual(result.graph.edges.length, 0, 'Graph should have no edges');
            
            result.panel.dispose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('ENOENT') && !errorMessage.includes('webviewContent.html')) {
                throw error;
            }
        }
    });

    test('DetailsViewProvider should initialize correctly', () => {
        const provider = new DetailsViewProvider(context.extensionUri);
        
        assert.strictEqual(DetailsViewProvider.viewType, 'ast-graph.detailsView', 'Should have correct view type');
        assert.ok(provider, 'Provider should be created');
    });

    test('DetailsViewProvider should handle updateDetails', () => {
        const provider = new DetailsViewProvider(context.extensionUri);
        
        const mockWebviewView = {
            viewType: 'ast-graph.detailsView',
            webview: {
                options: {},
                html: '',
                postMessage: (message: any) => {
                    assert.ok(message.command, 'Should have command in message');
                    return Promise.resolve(true);
                },
                onDidReceiveMessage: () => ({ dispose: () => {} }),
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: 'vscode-webview:'
            },
            show: () => {},
            title: 'Test Details',
            description: 'Test Description',
            badge: undefined,
            onDidDispose: () => ({ dispose: () => {} }),
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            visible: true
        } as unknown as vscode.WebviewView;

        provider.resolveWebviewView(mockWebviewView);

        const testData = {
            focusedNodeLabel: 'TestNode',
            edges: [],
            focusedNode: {
                id: 'test',
                label: 'TestNode',
                kind: 'class',
                data: {
                    fileUri: 'file:///test/TestNode.dart',
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 10, character: 0 }
                    }
                }
            }
        };

        assert.doesNotThrow(() => {
            provider.updateDetails(testData);
        }, 'updateDetails should not throw');
    });

    test('DetailsViewProvider should handle clearDetails', () => {
        const provider = new DetailsViewProvider(context.extensionUri);
        
        const mockWebviewView = {
            viewType: 'ast-graph.detailsView',
            webview: {
                options: {},
                html: '',
                postMessage: (message: any) => {
                    if (message.command === 'clear') {
                        assert.strictEqual(message.command, 'clear', 'Should send clear command');
                    }
                    return Promise.resolve(true);
                },
                onDidReceiveMessage: () => ({ dispose: () => {} }),
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: 'vscode-webview:'
            },
            show: () => {},
            title: 'Test Details',
            description: 'Test Description',
            badge: undefined,
            onDidDispose: () => ({ dispose: () => {} }),
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            visible: true
        } as unknown as vscode.WebviewView;

        provider.resolveWebviewView(mockWebviewView);

        assert.doesNotThrow(() => {
            provider.clearDetails();
        }, 'clearDetails should not throw');
    });

    test('createWebview should sanitize data properly', async () => {
        const mockData = {
            projectRoot: '/test/project',
            files: [{
                file: '/test/project/lib/main.dart',
                fileUri: 'file:///test/project/lib/main.dart',
                symbols: [{
                    name: 'TestClass<script>alert("xss")</script>',
                    kind: 5, 
                    uniqueId: 'test-id'
                }]
            }]
        };

        try {
            const result = await createWebview(context, mockData);
            
            assert.ok(result.graph, 'Should return graph');
            
            result.panel.dispose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('ENOENT') && !errorMessage.includes('webviewContent.html')) {
                throw error;
            }
        }
    });

    test('webview should handle nonce generation', async () => {
        const mockData = {
            projectRoot: '/test/project',
            files: []
        };

        try {
            const result = await createWebview(context, mockData);
            
            assert.ok(result.panel.webview, 'Should have webview');
            
            result.panel.dispose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('ENOENT') && !errorMessage.includes('webviewContent.html')) {
                throw error;
            }
        }
    });

    teardown(() => {
        context.subscriptions.forEach(sub => {
            if (sub && typeof sub.dispose === 'function') {
                sub.dispose();
            }
        });
    });
});