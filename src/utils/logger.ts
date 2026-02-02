import * as vscode from 'vscode';

class SimpleLogger {
  private static instance: SimpleLogger;
  private outputChannel: vscode.OutputChannel;
  private debugMode: boolean = false;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('satori');
    this.loadDebugConfig();
  }

  public static getInstance(): SimpleLogger {
    if (!SimpleLogger.instance) {
      SimpleLogger.instance = new SimpleLogger();
    }
    return SimpleLogger.instance;
  }

  public getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  private loadDebugConfig(): void {
    const config = vscode.workspace.getConfiguration('satori');
    this.debugMode = config.get<boolean>('enableDebugLogs', false);
  }

  public info(message: string): void {
    this.outputChannel.appendLine(message);
  }

  public error(message: string): void {
    this.outputChannel.appendLine(`❌ ${message}`);
  }

  public debug(message: string): void {
    if (this.debugMode) {
      this.outputChannel.appendLine(`[DEBUG] ${message}`);
    }
  }

  public show(): void {
    this.outputChannel.show();
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.info(`🔧 Debug logs ${enabled ? 'activados' : 'desactivados'}`);
  }

  public isDebugEnabled(): boolean {
    return this.debugMode;
  }
  
}

export const logger = SimpleLogger.getInstance();

export const log = {
  info: (message: string) => logger.info(message),
  error: (message: string) => logger.error(message),
  debug: (message: string) => logger.debug(message),
  show: () => logger.show(),
  setDebug: (enabled: boolean) => logger.setDebugMode(enabled),
  isDebug: () => logger.isDebugEnabled()
};