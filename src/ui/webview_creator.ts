import * as vscode from 'vscode';
import * as fs from 'fs';
import { EnrichedSymbol, EnrichmentDependencies, ProjectGraphModel } from '../types/index';
import path from 'path';
import { validateEnrichedData } from '../analysis/validation';
import { calculateNodeDegrees, sanitizeObjectStrings } from '../core';
import { buildGraphModel } from '../graph/graph_builder';
import { resolvedTypesCache } from '../utils/caches';
import { log } from '../utils/logger';
import { processSymbolRecursiveLSP } from '../analysis/symbol_processor';
import { Localization, t } from '../utils/localization';

/**
 * Creates and configures a webview to visualize the project's AST diagram.
 * Processes project files through symbol enrichment, builds the graph model, 
 * calculates coupling metrics, and generates the HTML interface with 
 * sanitized JSON data for interactive visualization.
 * 
 * @param context - Extension context with resources and configuration
 * @param data - Project data including analyzed files and symbols
 * @returns Promise with webview panel and generated graph model
 */
export async function createWebview( 
  context: vscode.ExtensionContext,
  data: { projectRoot: string; files: Array<{ file: string; fileUri: string, symbols: any[] }>}, 
) : Promise<{ panel: vscode.WebviewPanel; graph: ProjectGraphModel }> {
  function getLanguage(): string {
    const config = vscode.workspace.getConfiguration('satori');
    return config.get('language', 'en');
  }
  const panel = vscode.window.createWebviewPanel(
    'astDiagram',
    'AST Diagram',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media')
      ]
    }
  );

  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${panel.webview.cspSource} 'unsafe-inline'`, 
    `script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com https://unpkg.com ${panel.webview.cspSource}`,
    `img-src data: ${panel.webview.cspSource}`
  ].join('; ');

  log.debug('Starting data enrichment for webview..');
  resolvedTypesCache.clear();

  const allFilePaths = data.files.map(f => f.file);
  const projectClassRelations = buildClassRelationsFromSymbols(data.files);

  log.debug(`Verifying files and symbols before enrichment:`);

  log.debug(`AST relations detected: ${projectClassRelations.size}classes.`);

    const processedFilesPromises = data.files.map(async (f_item) => {
        const fileContent = fs.readFileSync(f_item.file, 'utf8');
        const fileUriString = (typeof f_item.fileUri === 'string' && f_item.fileUri.startsWith('file:'))
            ? f_item.fileUri
            : vscode.Uri.file(f_item.file).toString();

        const enrichmentDeps: EnrichmentDependencies = {
            projectClassRelations: projectClassRelations, 
            fileContent: fileContent,
            allProjectFilesData: data.files.map(df => ({
                ...df,
                fileUri: (typeof df.fileUri === 'string' && df.fileUri.startsWith('file:'))
                            ? df.fileUri
                            : vscode.Uri.file(df.file).toString()
            }))
        };

        const processedSymbols = f_item.symbols
        ? await Promise.all(f_item.symbols.map((sym: any) => {
                return processSymbolRecursiveLSP(
                    sym as EnrichedSymbol, 
                    fileUriString,         
                    enrichmentDeps,           
                    0,                     
                    undefined 
                )
                }
            ))
        : [];

        return { ...f_item, fileUri: fileUriString, symbols: processedSymbols };
    });

    data.files = await Promise.all(processedFilesPromises);
    log.debug('✅ Deep enrichment of all files completed.');

    log.debug('Phase 2: Building project graph model...');
    const projectGraph = await buildGraphModel(data.files, data.projectRoot);
    log.debug(`Phase 2: Graph model built. Nodes:  Nodos: ${projectGraph.nodes.length}, Aristas: ${projectGraph.edges.length}`);
   
    log.debug('Calculating coupling degrees (in/out degree) of nodes...');
    calculateNodeDegrees(projectGraph); 
    log.debug('✅ Coupling degrees calculated.');

    log.debug('Phase 2 (Continuation): Starting resolution of this.fieldName in constructors...');

    data.files.forEach(fileData => {

      const existingUniqueIds = new Set<string>();

      function findClassAndResolveThisFieldsRecursive(symbols: EnrichedSymbol[] | undefined) {
        if (!symbols) return;

        for (const s of symbols) {
          log.debug(`[DEBUG-KIND-CHECK] Symbol: ${s.name}, kind: ${s.kind}, children: ${s.children?.length ?? 0}`);

          if (s.uniqueId) {
            existingUniqueIds.add(s.uniqueId);
          }

          if (s.kind === 5 && s.children) { // kind === 5 => class
            const classSymbol = s;
            log.debug(`[DEBUG-CLASS] Class detected: ${classSymbol.name}`);

            classSymbol.children?.forEach(member => {
              log.debug(`[DEBUG-MEMBER] ${classSymbol.name}.${member.name || '(anon)'} - kind: ${member.kind}, params: ${member.parameters?.length ?? 0}`);

              if (member.kind === 9) {
                log.debug(`[DEBUG-CONSTRUCTOR] Constructor found: ${member.name}`);
                if (!member.parameters || member.parameters.length === 0) {
                  if (member.detail?.includes('this.')) {
                    log.debug(`  Constructor '${member.name}' without relevant parameters (self_field)`);
                  } else {
                    log.debug(`  ⚠️ Constructor '${member.name}' has no parameters. Missing enrichment?`);
                  }
                }

                if (member.parameters && member.parameters.length > 0) {
                  if (!member.parentId && classSymbol.uniqueId) {
                    member.parentId = classSymbol.uniqueId;
                    log.debug(`[DEBUG-RELATIONSHIP] Established parent of constructor  ${member.name || '(default)'} -> ${classSymbol.uniqueId}`);
                  }

                  log.debug(`  [ResolveThisField] Processing constructor ${classSymbol.name}.${member.name || '(default)'}`);

                  member.parameters.forEach(param => {
                    if (param.type?.startsWith('self_field:')) {
                      const fieldName = param.type.substring('self_field:'.length);

                      const fieldSymbol = classSymbol.children?.find(
                        f => f.name === fieldName && (f.kind === 7 || f.kind === 8)
                      );

                      if (fieldSymbol) {
                        if (fieldSymbol.resolvedType) {
                          log.debug(`    ↳ Param '${param.name || fieldName}' (this.${fieldName}): tipo actualizado de '${param.type}' a '${fieldSymbol.resolvedType}'. Def. enlazada: ${!!fieldSymbol.resolvedTypeRef?.definition}`);
                          param.type = fieldSymbol.resolvedType;
                          param.typeRef = fieldSymbol.resolvedTypeRef
                            ? { ...fieldSymbol.resolvedTypeRef }
                            : { name: fieldSymbol.resolvedType };
                        } else {
                          log.debug(`    ⚠️ Param '${param.name || fieldName}' (this.${fieldName}): Campo encontrado pero sin resolvedType en ${classSymbol.name}`);
                          param.typeRef = { name: param.type };
                        }
                      } else {
                        log.debug(`    ❌ Param '${param.name || fieldName}': Campo '${fieldName}' NO encontrado en ${classSymbol.name}`);
                        param.typeRef = { name: param.type };
                      }
                    }
                  });
                }
              }

            });
          }

          if (s.children) {
            findClassAndResolveThisFieldsRecursive(s.children);
          }
        }
      }

      if (fileData.symbols) {
        findClassAndResolveThisFieldsRecursive(fileData.symbols);

        log.debug(`[DEBUG-VALIDATE] Verifying consistency of parentId ↔ uniqueId...`);

        function validateParentIds(symbols: EnrichedSymbol[] | undefined) {
          if (!symbols) return;

          for (const sym of symbols) {
            if (sym.parentId && !existingUniqueIds.has(sym.parentId)) {
              log.debug(`❌ Inconsistency detected: parentId'${sym.parentId}' of '${sym.name}' does not exist in the uniqueIds set.`);
            }

            if (sym.children) {
              validateParentIds(sym.children);
            }
          }
        }

        validateParentIds(fileData.symbols);
      } else {
        log.debug(`[DEBUG] ⚠️ fileData.symbols is empty for: ${fileData.fileUri}`);
      }
    });


    log.debug('[✓] Resolution of this.fieldName fields in constructors completed.');

    
    const dataForWebview = {
      projectRoot: data.projectRoot, 
      graph: projectGraph 
    };

  log.debug('[Sanitize] Starting string sanitization for JSON....');
  sanitizeObjectStrings(dataForWebview); 
  log.debug('[Sanitize] String sanitization completed.');
  
  const astJson = JSON.stringify(dataForWebview).replace(/</g, '\\u003c');

  log.debug(`[DEBUG_JSON] Total length of astJson: ${astJson.length}`);
  const errorPosition = 832271;
  const snippetRadius = 100;

  const startSnippet = Math.max(0, errorPosition - snippetRadius);
  const endSnippet = Math.min(astJson.length, errorPosition + snippetRadius);
  const problematicSnippet = astJson.substring(startSnippet, endSnippet);

  log.debug(`[DEBUG_JSON] Snippet around position ${errorPosition}:`);
  log.debug(`>>>SNIPPET_START>>>`);
  log.debug(problematicSnippet);
  log.debug(`<<<SNIPPET_END<<<`);

  validateEnrichedData(data.files);

  let charCodes = [];
  for (let i = 0; i < problematicSnippet.length; i++) {
      charCodes.push(problematicSnippet.charCodeAt(i));
  }
  log.debug(`[DEBUG_JSON] Character codes of snippet: ${charCodes.join(', ')}`);
  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);
  const translations = {
    'loader.analyzing': t('loader.analyzing'),
    'loader.processing': t('loader.processing'),
    'loader.error': t('loader.error'),
    'loader.waiting': t('loader.waiting'),
    'loader.dataLoaded': t('loader.dataLoaded'),
    'button.back': t('button.back'),
    'layer.view': t('layer.view'),
    'layer.state': t('layer.state'),
    'layer.service': t('layer.service'),
    'layer.model': t('layer.model'),
    'layer.utility': t('layer.utility'),
    'overview.views': t('overview.views'),
    'overview.state': t('overview.state'),
    'overview.service': t('overview.service'),
    'overview.model': t('overview.model'),
    'overview.utility': t('overview.utility'),
    'overview.noLayers': t('overview.noLayers'),
    'context.traceFlow': t('context.traceFlow'),
    'search.placeholder': t('search.placeholder'),
    'search.noResults': t('search.noResults'),
    'folder.label': t('folder.label'),
    'breadcrumb.folders': t('breadcrumb.folders'),
    'legend.responsibilities': t('legend.responsibilities'),
    'legend.attributes': t('legend.attributes'),
    'legend.collaborators': t('legend.collaborators'),
    'legend.groupedObjects': t('legend.groupedObjects'),
    'legend.symbols': t('legend.symbols'),
    'legend.relationships': t('legend.relationships'),
    'packages.developed': t('packages.developed'),
    'packages.consumed': t('packages.consumed'),
    'edge.extends': t('edge.extends'),
    'edge.implements': t('edge.implements'),
    'edge.calls': t('edge.calls'),
    'edge.readsFrom': t('edge.readsFrom'),
    'edge.writesTo': t('edge.writesTo'),
    'narrative.showsUser': t('narrative.showsUser'),
    'narrative.readsFrom': t('narrative.readsFrom'),
    'narrative.buildsAndShows': t('narrative.buildsAndShows'),
    'narrative.instanceOf': t('narrative.instanceOf'),
    'narrative.notifies': t('narrative.notifies'),
    'narrative.delegates': t('narrative.delegates'),
    'narrative.formats': t('narrative.formats'),
    'narrative.managesState': t('narrative.managesState'),
    'narrative.reactsTo': t('narrative.reactsTo'),
    'narrative.implements': t('narrative.implements'),
    'narrative.extends': t('narrative.extends'),
    'overview.members': t('overview.members')
  };

  let html = fs.readFileSync(
    path.join(context.extensionUri.fsPath, 'media', 'webviewContent.html'),
    'utf8'
  )
  html = html
    .replace(/__CSP__/, csp)
    .replace(/__NONCE__/g, nonce)
    .replace(/__AST_JSON_PLACEHOLDER__/g, astJson)
    .replace(/__TRANSLATIONS__/g, JSON.stringify(translations)); 

  panel.webview.html = html;
  panel.webview.onDidReceiveMessage(async m => {
    if (m.command==='log') {
      log.debug(m.args.join(' '));
    }else if (m.command === 'openClass') {
      const uri   = vscode.Uri.parse(m.file);
      const start = new vscode.Position(m.start.line, m.start.character);
      const end   = new vscode.Position(m.end.line,   m.end.character);
      const range = new vscode.Range(start, end);

      const existing = vscode.window.visibleTextEditors.find(e =>
        e.document.uri.fsPath === m.file && e.viewColumn === vscode.ViewColumn.Two
      );
      if (existing) {
        existing.selection   = new vscode.Selection(start, end);
        existing.revealRange(range, vscode.TextEditorRevealType.InCenter);
        return;
      }

      panel.reveal(panel.viewColumn,true);

      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Two,
        preview: true    
      });

      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }else if (m.command === 'openFile') {
        const filePath = m.filePath;
        if (!filePath) {
            return;
        }

        const alreadyOpenEditor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );
        
        if (alreadyOpenEditor) {
            vscode.window.showTextDocument(alreadyOpenEditor.document, { 
                viewColumn: alreadyOpenEditor.viewColumn,
                preserveFocus: false 
            });
            return;
        }

       
        const uri = vscode.Uri.parse(filePath);
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Two, 
                preview: true
            });
        } catch (error) {
            log.error(`Error opening file:${filePath}`);
        }
    }
  });
  return { panel: panel, graph: projectGraph };
}

/**
 * Generates a random cryptographic nonce for Content Security Policy.
 * Creates a random string of 32 alphanumeric characters for webview
 * security, preventing script injection attacks.
 * 
 * @returns Random 32-character string for CSP use
 */
function getNonce() {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}


function buildClassRelationsFromSymbols(
    filesData: Array<{ fileUri: string, symbols: vscode.DocumentSymbol[] }>
): Map<string, { extends?: string[]; with: string[]; implements?: string[] }> {
    const relations = new Map<string, { extends?: string[]; with: string[]; implements?: string[] }>();
    const extendsRegex = /extends\s+([\w<, >]+)/;
    const withRegex = /with\s+([\w<, >]+(?:\s*,\s*[\w<, >]+)*)/;
    const implementsRegex = /implements\s+([\w<, >]+(?:\s*,\s*[\w<, >]+)*)/;

    function findClassesRecursive(symbols: vscode.DocumentSymbol[], fileUri: string) {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Class && symbol.detail) {
                const className = symbol.name;
                const classRelations = { extends: [] as string[], with: [] as string[], implements: [] as string[] };

                const extendsMatch = symbol.detail.match(extendsRegex);
                if (extendsMatch) { classRelations.extends.push(extendsMatch[1].trim()); }

                const withMatch = symbol.detail.match(withRegex);
                if (withMatch) { classRelations.with.push(...withMatch[1].split(',').map(s => s.trim())); }

                const implementsMatch = symbol.detail.match(implementsRegex);
                if (implementsMatch) { classRelations.implements.push(...implementsMatch[1].split(',').map(s => s.trim())); }
                
                relations.set(`${fileUri}#${className}`, classRelations);
            }
            if (symbol.children) {
                findClassesRecursive(symbol.children, fileUri);
            }
        }
    }
    for (const file of filesData) { findClassesRecursive(file.symbols, file.fileUri); }
    return relations;
}
