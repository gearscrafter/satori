import * as vscode from 'vscode';
import { log } from '../utils/logger';

export async function testCallHierarchy() {
    log.debug('\n--- STARTING LSP VALIDATION TEST: Call Hierarchy ---');

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        const msg = '❌ TEST CANCELLED: No active text editor. Open a Dart file.';
        log.debug(msg);
        vscode.window.showWarningMessage(msg);
        return;
    }
    const document = editor.document;
    const position = editor.selection.active;
    log.debug(`VALIDATION 2: Testing in "${document.uri.fsPath}" at line ${position.line + 1}, character ${position.character}.`);

   

    try {
         const result = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy',
            document.uri,
            position
        );
        
        log.debug('✅ VALIDATION 3: Request completed. LSP result:');
        log.debug(JSON.stringify(result, null, 2));

        if (result && result.length > 0) {
            vscode.window.showInformationMessage('SUCCESS! LSP responded correctly to the call hierarchy request.');
        } else {
            vscode.window.showWarningMessage('LSP responded, but found no valid item at this position (null or empty result).');
        }
    } catch (error: any) {
        log.error(`❌ FATAL ERROR sending request:  ${error.message}`);
    }
    log.debug('--- TEST FINISHED ---');
}