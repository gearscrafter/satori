import * as vscode from 'vscode';
import { t } from '../../utils/localization';
import * as fs from 'fs';
import { log } from '../../utils/logger';

let output: vscode.OutputChannel;

/**
 * Webview view provider to display semantic details of graph nodes.
 * Implements WebviewViewProvider to create a side panel that analyzes responsibilities,
 * decisions, validations and collaboration patterns of selected source code.
 */
export class DetailsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ast-graph.detailsView';
    public view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media'), this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    /**
     * Updates the details panel with focused node information.
     * Performs semantic analysis of the node's source code and sends
     * enriched data including detected responsibilities and patterns.
     * 
     * @param data - Focused node data with edges and metadata
     */
    public updateDetails(data: { focusedNodeLabel: string, edges: any[], focusedNode?: any } | null) {
       if (this.view && data) {
            const semanticAnalysis = data.focusedNode ? this.analyzeNodeSemantics(data.focusedNode) : null;
            
            this.view.webview.postMessage({ 
                command: 'update', 
                data: {
                    ...data,
                    semantics: semanticAnalysis
                }
            });
        }
    }

    private analyzeNodeSemantics(node: any): any {
        if (!node || !node.data?.fileUri) return null;
        
        try {
            const sourceCode = this.getSourceCodeForNode(node);
            return {
                responsibilities: this.extractResponsibilities(sourceCode, node),
                decisions: this.extractDecisions(sourceCode, node),
                validations: this.extractValidations(sourceCode, node),
                collaborations: this.extractCollaborationPatterns(sourceCode, node)
            };
        } catch (error) {
            return null;
        }
    }

    private extractResponsibilities(sourceCode: string, node: any): string[] {
        const responsibilities = [];
        
        if (sourceCode.includes('return ') && node.kind === 'method') {
            if (sourceCode.match(/return\s+\w+\.\w+/)) {
                responsibilities.push(t('responsibilities.transformsData'));
            }
            if (sourceCode.match(/return\s+new\s+\w+/)) {
                responsibilities.push(t('responsibilities.createsObjects'));
            }
        }
        
        if (sourceCode.includes('setState') || sourceCode.includes('emit(')) {
            responsibilities.push(t('responsibilities.managesState'));
        }
        
        if (sourceCode.includes('Navigator.') || sourceCode.includes('context.go')) {
            responsibilities.push(t('responsibilities.controlsNavigation'));
        }
        
        if (sourceCode.match(/http\.|client\.|api\./)) {
            responsibilities.push(t('responsibilities.communicatesWithServices'));
        }
        
        if (sourceCode.includes('validate') || sourceCode.match(/if\s*\([^)]*\.isEmpty/)) {
            responsibilities.push(t('responsibilities.validatesInput'));
        }
        
        return responsibilities;
    }

    private extractDecisions(sourceCode: string, node: any): string[] {
        const decisions = [];
        
        const ifMatches = sourceCode.match(/if\s*\([^)]+\)/g) || [];
        if (ifMatches.length > 0) {
            decisions.push(t('decisions.conditionalDecisions', ifMatches.length.toString()));
        }
        
        const switchMatches = sourceCode.match(/switch\s*\([^)]+\)/g) || [];
        if (switchMatches.length > 0) {
            decisions.push(t('decisions.businessCases', switchMatches.length.toString()));
        }
        
        if (sourceCode.includes('? ') && sourceCode.includes(': ')) {
            decisions.push(t('decisions.ternaryOperators'));
        }
        
        if (sourceCode.match(/throw\s+\w+Exception/)) {
            decisions.push(t('decisions.throwsExceptions'));
        }
        
        return decisions;
    }

    private extractValidations(sourceCode: string, node: any): string[] {
        const validations = [];
        
        if (sourceCode.match(/\.isEmpty|\.isNotEmpty/)) {
            validations.push(t('validations.checksEmpty'));
        }
        
        if (sourceCode.match(/\.length\s*[<>]=?\s*\d/)) {
            validations.push(t('validations.checksLength'));
        }
        
        if (sourceCode.includes('assert(') || sourceCode.includes('require(')) {
            validations.push(t('validations.preconditions'));
        }
        
        if (sourceCode.match(/\bnull\b.*check|\bcheck.*\bnull\b/i)) {
            validations.push(t('validations.preventsNull'));
        }
        
        return validations;
    }

    private getSourceCodeForNode(node: any): string {
        if (!node?.data?.fileUri || !node?.data?.range) {
            return '';
        }
        
        try {
            const filePath = vscode.Uri.parse(node.data.fileUri).fsPath;
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const lines = fileContent.split(/\r?\n/);
            
            const start = node.data.range.start;
            const end = node.data.range.end;
            
            if (start.line >= lines.length || end.line >= lines.length) {
                return '';
            }
            
            if (start.line === end.line) {
                return lines[start.line].substring(start.character, end.character);
            }
            
            let text = lines[start.line].substring(start.character);
            for (let i = start.line + 1; i < end.line; i++) {
                text += '\n' + lines[i];
            }
            text += '\n' + lines[end.line].substring(0, end.character);
            return text;
            
        } catch (error) {
            return '';
        }
    }

    private extractCollaborationPatterns(sourceCode: string, node: any): string[] {
        const patterns = [];
        
        const methodCalls = sourceCode.match(/\.\w+\(\)/g);
        if (methodCalls && methodCalls.length > 3) {
            patterns.push(t('collaborations.intensiveCollaboration'));
        }
        
        if (sourceCode.includes('await ')) {
            patterns.push(t('collaborations.coordinatesAsync'));
        }
        
        if (sourceCode.includes('listen') || sourceCode.includes('stream')) {
            patterns.push(t('collaborations.listensReactively'));
        }
        
        return patterns;
    }

    /**
     * Clears the details panel content by sending clear command
     * to the webview. Used when focus is lost or diagram is closed.
     */
    public clearDetails() {
        if (this.view) {
            this.view.webview.postMessage({ command: 'clear' });
        }
    }

    public updateLanguage() {
        if (this.view) {
            this.view.webview.html = this._getHtmlForWebview(this.view.webview);
        }
    }

   private _getHtmlForWebview(webview: vscode.Webview): string {
        log.debug(`Looking for details panel HTML file..`);
        
        try {
            const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'detailsView.html');
            log.debug(`[DEBUG] Path constructed: ${htmlPath.fsPath}`);

            if (!fs.existsSync(htmlPath.fsPath)) {
                log.debug(`File not found! Make sure 'detailsView.html' is in your project root folder.`);
                return `<h1>Error: detailsView.html not found</h1>`;
            }

            log.debug(`[DEBUG] File found. Reading content...`);

            const translations = {
                'details.placeholder': t('details.placeholder'),
                'details.noCollaborations': t('details.noCollaborations'),
                'details.analysisOf': t('details.analysisOf'),
                'details.collaborations': t('details.collaborations'),
                'details.noValidRelations': t('details.noValidRelations'),
                'details.responsibilities': t('details.responsibilities'),
                'details.decisions': t('details.decisions'),
                'details.validations': t('details.validations'),
                'details.behaviors': t('details.behaviors'),
                'details.responsibilities.count': t('details.responsibilities.count'),
                'details.decisions.count': t('details.decisions.count'),
                'details.validations.count': t('details.validations.count'),
                'details.behaviors.count': t('details.behaviors.count'),
                'details.multipleComponents': t('details.multipleComponents'),
                'verb.extends': t('verb.extends'),
                'verb.implements': t('verb.implements'),
                'verb.calls': t('verb.calls'),
                'verb.readsFrom': t('verb.readsFrom'),
                'verb.writesTo': t('verb.writesTo'),
                'verb.instanceOf': t('verb.instanceOf'),
                'verb.usesAsType': t('verb.usesAsType'),
                'verb.unknown': t('verb.unknown'),
                'verb.reactsTo': t('verb.reactsTo'),
                'verb.showsUser': t('verb.showsUser'),
                'verb.buildsAndShows': t('verb.buildsAndShows'),
                'verb.managesState': t('verb.managesState'),
                'verb.delegates': t('verb.delegates'),
                'verb.notifies': t('verb.notifies'),
                'verb.composedOf': t('verb.composedOf'),
                'verb.formats': t('verb.formats'),
                'verb.assembles': t('verb.assembles'),
                'verb.reportsEvent': t('verb.reportsEvent'),
                'narrative.verb.showsUser': t('narrative.verb.showsUser'),
                'narrative.verb.readsFrom': t('narrative.verb.readsFrom'),
                'narrative.verb.buildsAndShows': t('narrative.verb.buildsAndShows'),
                'narrative.verb.instanceOf': t('narrative.verb.instanceOf'),
                'narrative.verb.notifies': t('narrative.verb.notifies'),
                'narrative.verb.delegates': t('narrative.verb.delegates'),
                'narrative.verb.formats': t('narrative.verb.formats'),
                'narrative.verb.managesState': t('narrative.verb.managesState'),
                'narrative.verb.reactsTo': t('narrative.verb.reactsTo'),
                'narrative.verb.implements': t('narrative.verb.implements'),
                'narrative.verb.extends': t('narrative.verb.extends'),
                'narrative.default': t('narrative.default'),
                'responsibilities.transformsData': t('responsibilities.transformsData'),
                'responsibilities.createsObjects': t('responsibilities.createsObjects'),
                'responsibilities.managesState': t('responsibilities.managesState'),
                'responsibilities.controlsNavigation': t('responsibilities.controlsNavigation'),
                'responsibilities.communicatesWithServices': t('responsibilities.communicatesWithServices'),
                'responsibilities.validatesInput': t('responsibilities.validatesInput'),
                'decisions.conditionalDecisions': t('decisions.conditionalDecisions'),
                'decisions.businessCases': t('decisions.businessCases'),
                'decisions.ternaryOperators': t('decisions.ternaryOperators'),
                'decisions.throwsExceptions': t('decisions.throwsExceptions'),
                'validations.checksEmpty': t('validations.checksEmpty'),
                'validations.checksLength': t('validations.checksLength'),
                'validations.preconditions': t('validations.preconditions'),
                'validations.preventsNull': t('validations.preventsNull'),
                'collaborations.intensiveCollaboration': t('collaborations.intensiveCollaboration'),
                'collaborations.coordinatesAsync': t('collaborations.coordinatesAsync'),
                'collaborations.listensReactively': t('collaborations.listensReactively')
            };
            let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        
            if (html.includes('window.translations || {')) {
                html = html.replace(
                    'const translations = window.translations || {',
                    `const translations = ${JSON.stringify(translations)} || {`
                );
            }
            
            return html;

        } catch (e: any) {
            log.debug(`[ERROR] Catastrophic failure loading details view: ${e.message}`);
            return `<h1>Critical Error: ${e.message}</h1>`;
        }
    }

}