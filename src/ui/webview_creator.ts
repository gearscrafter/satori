import * as vscode from 'vscode';
import * as fs from 'fs';
import { EnrichedSymbol, EnrichmentDependencies, ProjectGraphModel } from '../types/index';
import path from 'path';
import { validateEnrichedData } from '../analysis/validation';
import { calculateNodeDegrees, sanitizeObjectStrings, mapLimited } from '../core';
import { buildGraphModel } from '../graph/graph_builder';
import { resolvedTypesCache } from '../utils/caches';
import { log } from '../utils/logger';
import { processSymbolRecursiveLSP } from '../analysis/symbol_processor';
import { buildClassRelationsFromSymbols } from '../analysis/class_relations';
import { Localization } from '../utils/localization';
import { parseImports, parsePubspecName, ImportRef } from '../analysis/imports';
import { findProjectRootWithPubspec } from '../filesystem/pattern_matcher';
import { readPackageLibDirs, findSdkLibDir, resolveImportFile } from '../packages/import_targets';
import { findDartSdk } from '../lsp/dart_sdk';
import { buildTypeIndex, clearTypeIndex } from '../analysis/enrichment/type-resolver';
import { clearHoverCache } from '../lsp/hover_enrichment';
import { readAuditConfig } from '../analysis/audit_config';
import { loadArchitecture, viewArchitecture } from '../analysis/architecture_file';
import { setArchitecture } from '../graph/layer_classifier';
import { NavigationOutcome } from '../analysis/navigation_runner';
import { setNavigationIndex, setPassProgress } from '../lsp/reference_analysis';
import { LoadingReporter, silentReporter } from './loading_state';
import { t } from '../utils/localization';

const ENRICH_FILE_CONCURRENCY = 4;

/** Name of the package the analysed folder belongs to, from the closest pubspec.yaml. Empty when there is none. */
function readOwnPackageName(projectRoot: string): string {
  try {
    const root = findProjectRootWithPubspec(projectRoot);
    return root ? parsePubspecName(fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8')) : '';
  } catch {
    return '';
  }
}

/**
 * Source file behind every external import of the project (`package:dio/dio.dart`, `dart:async`...), as a file URI,
 * so the diagram can open the code of a dependency. Imports that cannot be found are simply left out.
 */
function resolveImportTargets(projectRoot: string, fileImports: Record<string, ImportRef[]>, ownPackage: string): Record<string, string> {
  const targets: Record<string, string> = {};
  try {
    const root = findProjectRootWithPubspec(projectRoot);
    if (!root) { return targets; }
    const configPath = path.join(root, '.dart_tool', 'package_config.json');
    let libDirs: Record<string, string> = {};
    const candidates: string[] = [];
    if (fs.existsSync(configPath)) {
      const json = fs.readFileSync(configPath, 'utf8');
      libDirs = readPackageLibDirs(json, path.dirname(configPath));
      const flutterRoot = (JSON.parse(json) as { flutterRoot?: string }).flutterRoot;
      if (flutterRoot) { candidates.push(path.join(vscode.Uri.parse(flutterRoot).fsPath, 'bin', 'cache', 'dart-sdk')); }
    }
    const dart = findDartSdk();
    if (dart) {
      candidates.push(path.dirname(path.dirname(dart)), path.join(path.dirname(dart), 'cache', 'dart-sdk'));
    }
    const sdkLib = findSdkLibDir(candidates);

    const wanted = new Set<string>();
    Object.values(fileImports).forEach(list => list.forEach(i => {
      if (i.uri.startsWith('dart:') || (i.uri.startsWith('package:') && !i.uri.startsWith(`package:${ownPackage}/`))) { wanted.add(i.uri); }
    }));
    wanted.forEach(uri => {
      const file = resolveImportFile(uri, libDirs, sdkLib);
      if (file) { targets[uri] = vscode.Uri.file(file).toString(); }
    });
  } catch (error) {
    log.debug(`Could not resolve the imports to files: ${error}`);
  }
  return targets;
}

/** Workspace-state key under which the drawings made in edit mode are kept for a project. */
export function annotationsKey(projectRoot: string): string {
  return `satori.annotations:${projectRoot}`;
}

/** Drawings saved for a project, or an empty object when there are none. */
export function loadAnnotations(memento: vscode.Memento, projectRoot: string): Record<string, unknown> {
  return memento.get<Record<string, unknown>>(annotationsKey(projectRoot), {});
}

export function saveAnnotations(memento: vscode.Memento, projectRoot: string, data: Record<string, unknown>): Thenable<void> {
  return memento.update(annotationsKey(projectRoot), data);
}

/**
 * Finds the field or property of a class matching a `this.fieldName` constructor parameter.
 */
export function findClassFieldSymbol(classSymbol: EnrichedSymbol, fieldName: string): EnrichedSymbol | undefined {
  return classSymbol.children?.find(
    f => f.name === fieldName && (
      f.kind === vscode.SymbolKind.Field ||
      f.kind === vscode.SymbolKind.Property
    )
  );
}

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
  data: {
    projectRoot: string;
    files: Array<{ file: string; fileUri: string; symbols: any[] }>;
    /** A finished analysis of the same files: the language server is not asked again. */
    cached?: { graph: ProjectGraphModel; fileImports: Record<string, ImportRef[]> };
    /** Started earlier, in parallel with the symbols: where every symbol is used, from Dart's analysis server. */
    navigation?: Promise<NavigationOutcome | null>;
    /** Where the notification is told how the analysis is going. */
    reporter?: LoadingReporter;
  },
): Promise<{ panel: vscode.WebviewPanel; graph: ProjectGraphModel; fileImports: Record<string, ImportRef[]>; timings: { enrichMs: number; graphMs: number; finishMs: number; relationsWaitMs: number; engine: string } }> {
  const startedAt = Date.now();
  const reporter = data.reporter ?? silentReporter;

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
    `script-src 'nonce-${nonce}' ${panel.webview.cspSource}`,
    `img-src data: ${panel.webview.cspSource}`
  ].join('; ');

  const fileImports: Record<string, ImportRef[]> = {};
  const loadedArchitecture = loadArchitecture(data.projectRoot);
  if (loadedArchitecture.problems.length > 0) {
    loadedArchitecture.problems.forEach(p => log.info(`satori.json: ${p}`));
    void vscode.window.showWarningMessage(`satori.json: ${loadedArchitecture.problems[0]}${loadedArchitecture.problems.length > 1 ? ` (+${loadedArchitecture.problems.length - 1} more, see the "satori" output)` : ''}`);
  }
  let projectGraph: ProjectGraphModel;
  let enrichedAt: number;
  let graphBuiltAt: number;
  let engine = "saved analysis";
  let relationsWaitMs = 0;

  if (data.cached) {
    projectGraph = data.cached.graph;
    Object.assign(fileImports, data.cached.fileImports);
    enrichedAt = graphBuiltAt = Date.now();
    log.info(`Using the saved analysis: ${projectGraph.nodes.length} nodes, ${projectGraph.edges.length} edges.`);
  } else {
  log.debug('Starting data enrichment for webview..');
  resolvedTypesCache.clear();
  clearHoverCache();

  const projectClassRelations = buildClassRelationsFromSymbols(data.files);
  log.debug(`AST relations detected: ${projectClassRelations.size} classes.`);

  buildTypeIndex(data.files);
  log.debug('[TypeIndex] Type index built — starting enrichment.');

  // Built once: copying every file record for each file made this step quadratic in the number of files.
  const allProjectFilesData = data.files.map(df => ({
    ...df,
    fileUri: (typeof df.fileUri === 'string' && df.fileUri.startsWith('file:'))
      ? df.fileUri
      : vscode.Uri.file(df.file).toString()
  }));

  // Every file at once flooded the language server with thousands of hover requests; a few at a time keeps it answering.
  reporter.start('types');
  const processedFiles = await mapLimited(data.files, ENRICH_FILE_CONCURRENCY, async (f_item) => {
    const fileContent = fs.readFileSync(f_item.file, 'utf8');
    const fileUriString = (typeof f_item.fileUri === 'string' && f_item.fileUri.startsWith('file:'))
      ? f_item.fileUri
      : vscode.Uri.file(f_item.file).toString();
    const imports = parseImports(fileContent);
    if (imports.length) { fileImports[fileUriString] = imports; }

    const enrichmentDeps: EnrichmentDependencies = {
      projectClassRelations,
      fileContent,
      allProjectFilesData
    };

    const processedSymbols = f_item.symbols
      ? await Promise.all(f_item.symbols.map((sym: any) =>
          processSymbolRecursiveLSP(sym as EnrichedSymbol, fileUriString, enrichmentDeps, 0, undefined)
        ))
      : [];

    return { ...f_item, fileUri: fileUriString, symbols: processedSymbols };
  }, (done, total) => reporter.progress('types', done, total));
  reporter.finish('types');

  data.files = processedFiles;
  enrichedAt = Date.now();
  log.debug('✅ Deep enrichment of all files completed.');

  clearTypeIndex();
  log.debug('✅ Type index cleared.');

  log.debug('Phase 2: Building project graph model...');
  reporter.start('graph');
  // Dart's analysis server works while the symbols are read; what is still left of it when they are done is waiting, not graph building.
  const waitStarted = Date.now();
  const navigation = data.navigation ? await data.navigation : null;
  relationsWaitMs = Date.now() - waitStarted;
  if (navigation) {
    log.info(`Relationships read from the analysis server: ${navigation.files} files (start ${navigation.startMs}ms, analysis ${navigation.analyzeMs}ms, navigation ${navigation.navigationMs}ms).`);
  }
  engine = navigation ? "analysis server" : "language server";
  setNavigationIndex(navigation ? navigation.index : null);
  setArchitecture(loadedArchitecture.architecture, data.projectRoot);
  setPassProgress((pass, done, total) => reporter.progress('graph', done, total, t(`loading.graph.${pass}`)));
  try {
    projectGraph = await buildGraphModel(data.files, data.projectRoot);
  } finally {
    setNavigationIndex(null);
    setArchitecture(null);
    setPassProgress(null);
  }
  reporter.finish('graph');
  if (!loadedArchitecture.architecture.builtin) {
    const classes = projectGraph.nodes.filter(n => n.kind === 'class');
    const neutral = classes.filter(n => n.data.layer === loadedArchitecture.architecture.neutral).length;
    log.info(`satori.json: ${classes.length - neutral} of ${classes.length} classes were placed in a layer; ${neutral} are in "${loadedArchitecture.architecture.neutral}".`);
  }
  graphBuiltAt = Date.now();
  log.debug(`Phase 2: Graph model built. Nodes: ${projectGraph.nodes.length}, Edges: ${projectGraph.edges.length}`);

  log.debug('Calculating coupling degrees (in/out degree) of nodes...');
  calculateNodeDegrees(projectGraph);
  log.debug('✅ Coupling degrees calculated.');

  log.debug('Phase 3: Starting resolution of this.fieldName in constructors...');

  const existingUniqueIds = new Set<string>();

  data.files.forEach(fileData => {
    function collectUniqueIds(symbols: EnrichedSymbol[] | undefined) {
      if (!symbols) {return;}
      for (const s of symbols) {
        if (s.uniqueId) {existingUniqueIds.add(s.uniqueId);}
        if (s.children) {collectUniqueIds(s.children);}
      }
    }
    collectUniqueIds(fileData.symbols);
  });

  data.files.forEach(fileData => {
    function findClassAndResolveThisFieldsRecursive(symbols: EnrichedSymbol[] | undefined) {
      if (!symbols) {return;}

      for (const s of symbols) {
        log.debug(`[DEBUG-KIND-CHECK] Symbol: ${s.name}, kind: ${s.kind}, children: ${s.children?.length ?? 0}`);

        if (s.kind === vscode.SymbolKind.Class && s.children) {
          const classSymbol = s;
          log.debug(`[DEBUG-CLASS] Class detected: ${classSymbol.name}`);

          classSymbol.children?.forEach(member => {
            log.debug(`[DEBUG-MEMBER] ${classSymbol.name}.${member.name || '(anon)'} - kind: ${member.kind}, params: ${member.parameters?.length ?? 0}`);

            if (member.kind === vscode.SymbolKind.Constructor) {
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
                  log.debug(`[DEBUG-RELATIONSHIP] Established parent of constructor ${member.name || '(default)'} -> ${classSymbol.uniqueId}`);
                }

                log.debug(`  [ResolveThisField] Processing constructor ${classSymbol.name}.${member.name || '(default)'}`);

                member.parameters.forEach(param => {
                  if (param.type?.startsWith('self_field:')) {
                    const fieldName = param.type.substring('self_field:'.length);

                    const fieldSymbol = findClassFieldSymbol(classSymbol, fieldName);

                    if (fieldSymbol) {
                      if (fieldSymbol.resolvedType) {
                        log.debug(`    ↳ Param '${param.name || fieldName}' (this.${fieldName}): type updated from '${param.type}' to '${fieldSymbol.resolvedType}'. Linked def: ${!!fieldSymbol.resolvedTypeRef?.definition}`);
                        param.type = fieldSymbol.resolvedType;
                        param.typeRef = fieldSymbol.resolvedTypeRef
                          ? { ...fieldSymbol.resolvedTypeRef }
                          : { name: fieldSymbol.resolvedType };
                      } else {
                        log.debug(`    ⚠️ Param '${param.name || fieldName}' (this.${fieldName}): field found but no resolvedType in ${classSymbol.name}`);
                        param.typeRef = { name: param.type };
                      }
                    } else {
                      log.debug(`    ❌ Param '${param.name || fieldName}': field '${fieldName}' NOT found in ${classSymbol.name}`);
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
    } else {
      log.debug(`[DEBUG] ⚠️ fileData.symbols is empty for: ${fileData.fileUri}`);
    }
  });

  log.debug(`[DEBUG-VALIDATE] Verifying consistency of parentId ↔ uniqueId...`);
  function validateParentIds(symbols: EnrichedSymbol[] | undefined) {
    if (!symbols) {return;}
    for (const sym of symbols) {
      if (sym.parentId && !existingUniqueIds.has(sym.parentId)) {
        log.debug(`❌ Inconsistency detected: parentId '${sym.parentId}' of '${sym.name}' does not exist in the uniqueIds set.`);
      }
      if (sym.children) {validateParentIds(sym.children);}
    }
  }
  data.files.forEach(fileData => validateParentIds(fileData.symbols));

  log.debug('[✓] Resolution of this.fieldName fields in constructors completed.');
  }

  const ownPackage = readOwnPackageName(data.projectRoot);
  const dataForWebview = {
    projectRoot: data.projectRoot,
    graph: projectGraph,
    fileImports,
    ownPackage,
    architecture: viewArchitecture(loadedArchitecture.architecture),
    auditConfig: readAuditConfig(key => vscode.workspace.getConfiguration('satori').get(key)),
    importTargets: resolveImportTargets(data.projectRoot, fileImports, ownPackage)
  };

  log.debug('[Sanitize] Starting string sanitization for JSON...');
  sanitizeObjectStrings(dataForWebview);
  log.debug('[Sanitize] String sanitization completed.');

  const savedAnnotations = loadAnnotations(context.workspaceState, data.projectRoot);
  const astJson = JSON.stringify({ ...dataForWebview, annotations: savedAnnotations }, (key, value) => {
    if (typeof value === 'string') {
      return value.replace(/\\/g, '/');
    }
    return value;
  }).replace(/</g, '\\u003c');

  log.debug(`[DEBUG_JSON] Total length of astJson: ${astJson.length}`);

  if (!data.cached) { validateEnrichedData(data.files); }

  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);

  const translations = Localization.getInstance().getByPrefix('trail.', 'hud.', 'layer.');

  const mediaUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media')).toString();
  let html = fs.readFileSync(
    path.join(context.extensionUri.fsPath, 'media', 'webviewContent.html'),
    'utf8'
  );
  // Function replacers keep "$&"-style sequences inside the data from being interpreted.
  html = html
    .replace(/__CSP__/, () => csp)
    .replace(/__MEDIA__/g, () => mediaUri)
    .replace(/__NONCE__/g, () => nonce)
    .replace(/__AST_JSON_PLACEHOLDER__/g, () => astJson)
    .replace(/__TRANSLATIONS__/g, () => JSON.stringify(translations).replace(/</g, '\\u003c'));

  reporter.start('draw');
  panel.webview.html = html;


  const finishedAt = Date.now();
  return {
    panel,
    graph: projectGraph,
    fileImports,
    timings: { enrichMs: enrichedAt - startedAt, graphMs: graphBuiltAt - enrichedAt - relationsWaitMs, finishMs: finishedAt - graphBuiltAt, relationsWaitMs, engine }
  };
}

/**
 * Generates a random cryptographic nonce for Content Security Policy.
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

