import * as vscode from 'vscode';

export interface ILanguageServiceClient {
  sendDocumentSymbolRequest(uri: string): Promise<any[]>;
  sendHoverRequest(uri: string, position: vscode.Position): Promise<vscode.Hover | null>;
  sendReferencesRequest(uri: string, position: vscode.Position): Promise<vscode.Location[]>;
  isReady(): Promise<void>;
}