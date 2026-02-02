import * as vscode from 'vscode';
import { log } from '../utils/logger';

/**
 * Registers debugging commands for the Satori extension.
 * Configures the toggle command to enable/disable debug logs
 * and adds it to the context subscriptions for lifecycle management.
 * 
 * @param context - Extension context where commands are registered
 */

export function registerDebugCommands(context: vscode.ExtensionContext) {
  
  const toggleDebugCommand = vscode.commands.registerCommand(
    'satori.toggleDebugLogs', 
    () => {
      const currentState = log.isDebug();
      log.setDebug(!currentState);
      
      vscode.window.showInformationMessage(
        `Debug logs ${!currentState ? 'enabled' : 'disabled'}`
      );
    }
  );
  

  context.subscriptions.push(toggleDebugCommand);
}

