"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(extension_exports);

// src/ui/extension_lifecycle.ts
var vscode29 = __toESM(require("vscode"));
var import_path8 = __toESM(require("path"));
var fs19 = __toESM(require("fs"));

// src/ui/providers/details_provider.ts
var vscode3 = __toESM(require("vscode"));

// src/utils/localization.ts
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var Localization = class _Localization {
  static instance;
  translations = {};
  static getInstance() {
    if (!_Localization.instance) {
      _Localization.instance = new _Localization();
    }
    return _Localization.instance;
  }
  async loadTranslations(extensionPath, language) {
    if (!language) {
      const config = vscode.workspace.getConfiguration("satori");
      language = config.get("language", "en");
    }
    const translationPath = path.join(extensionPath, "localization", `${language}.json`);
    try {
      const content = fs.readFileSync(translationPath, "utf8");
      this.translations = JSON.parse(content);
    } catch (error) {
      const fallbackPath = path.join(extensionPath, "localization", "en.json");
      const content = fs.readFileSync(fallbackPath, "utf8");
      this.translations = JSON.parse(content);
    }
  }
  getByPrefix(...prefixes) {
    const result = {};
    for (const [key, value] of Object.entries(this.translations)) {
      if (prefixes.some((p) => key.startsWith(p))) {
        result[key] = value;
      }
    }
    return result;
  }
  t(key, ...args) {
    let translation = this.translations[key] || key;
    args.forEach((arg, index) => {
      translation = translation.replace(`{${index}}`, arg);
    });
    return translation;
  }
};
var t = (key, ...args) => {
  return Localization.getInstance().t(key, ...args);
};

// src/ui/providers/details_provider.ts
var fs2 = __toESM(require("fs"));

// src/utils/logger.ts
var vscode2 = __toESM(require("vscode"));
var SimpleLogger = class _SimpleLogger {
  static instance;
  outputChannel;
  debugMode = false;
  constructor() {
    this.outputChannel = vscode2.window.createOutputChannel("satori");
    this.loadDebugConfig();
  }
  static getInstance() {
    if (!_SimpleLogger.instance) {
      _SimpleLogger.instance = new _SimpleLogger();
    }
    return _SimpleLogger.instance;
  }
  getOutputChannel() {
    return this.outputChannel;
  }
  loadDebugConfig() {
    const config = vscode2.workspace.getConfiguration("satori");
    this.debugMode = config.get("enableDebugLogs", false);
  }
  info(message) {
    this.outputChannel.appendLine(message);
  }
  error(message) {
    this.outputChannel.appendLine(`\u274C ${message}`);
  }
  debug(message) {
    if (this.debugMode) {
      this.outputChannel.appendLine(`[DEBUG] ${message}`);
    }
  }
  show() {
    this.outputChannel.show();
  }
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.info(`\u{1F527} Debug logs ${enabled ? "activados" : "desactivados"}`);
  }
  isDebugEnabled() {
    return this.debugMode;
  }
};
var logger = SimpleLogger.getInstance();
var log = {
  info: (message) => logger.info(message),
  error: (message) => logger.error(message),
  debug: (message) => logger.debug(message),
  show: () => logger.show(),
  setDebug: (enabled) => logger.setDebugMode(enabled),
  isDebug: () => logger.isDebugEnabled()
};

// src/ui/providers/details_provider.ts
var DetailsViewProvider = class {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  static viewType = "ast-graph.detailsView";
  view;
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode3.Uri.joinPath(this._extensionUri, "media"), this._extensionUri]
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
  updateDetails(data) {
    if (this.view && data) {
      const semanticAnalysis = data.focusedNode ? this.analyzeNodeSemantics(data.focusedNode) : null;
      this.view.webview.postMessage({
        command: "update",
        data: {
          ...data,
          semantics: semanticAnalysis
        }
      });
    }
  }
  analyzeNodeSemantics(node) {
    if (!node || !node.data?.fileUri) {
      return null;
    }
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
  extractResponsibilities(sourceCode, node) {
    const responsibilities = [];
    if (sourceCode.includes("return ") && node.kind === "method") {
      if (sourceCode.match(/return\s+\w+\.\w+/)) {
        responsibilities.push(t("responsibilities.transformsData"));
      }
      if (sourceCode.match(/return\s+new\s+\w+/)) {
        responsibilities.push(t("responsibilities.createsObjects"));
      }
    }
    if (sourceCode.includes("setState") || sourceCode.includes("emit(")) {
      responsibilities.push(t("responsibilities.managesState"));
    }
    if (sourceCode.includes("Navigator.") || sourceCode.includes("context.go")) {
      responsibilities.push(t("responsibilities.controlsNavigation"));
    }
    if (sourceCode.match(/http\.|client\.|api\./)) {
      responsibilities.push(t("responsibilities.communicatesWithServices"));
    }
    if (sourceCode.includes("validate") || sourceCode.match(/if\s*\([^)]*\.isEmpty/)) {
      responsibilities.push(t("responsibilities.validatesInput"));
    }
    return responsibilities;
  }
  extractDecisions(sourceCode, node) {
    const decisions = [];
    const ifMatches = sourceCode.match(/if\s*\([^)]+\)/g) || [];
    if (ifMatches.length > 0) {
      decisions.push(t("decisions.conditionalDecisions", ifMatches.length.toString()));
    }
    const switchMatches = sourceCode.match(/switch\s*\([^)]+\)/g) || [];
    if (switchMatches.length > 0) {
      decisions.push(t("decisions.businessCases", switchMatches.length.toString()));
    }
    if (sourceCode.includes("? ") && sourceCode.includes(": ")) {
      decisions.push(t("decisions.ternaryOperators"));
    }
    if (sourceCode.match(/throw\s+\w+Exception/)) {
      decisions.push(t("decisions.throwsExceptions"));
    }
    return decisions;
  }
  extractValidations(sourceCode, node) {
    const validations = [];
    if (sourceCode.match(/\.isEmpty|\.isNotEmpty/)) {
      validations.push(t("validations.checksEmpty"));
    }
    if (sourceCode.match(/\.length\s*[<>]=?\s*\d/)) {
      validations.push(t("validations.checksLength"));
    }
    if (sourceCode.includes("assert(") || sourceCode.includes("require(")) {
      validations.push(t("validations.preconditions"));
    }
    if (sourceCode.match(/\bnull\b.*check|\bcheck.*\bnull\b/i)) {
      validations.push(t("validations.preventsNull"));
    }
    return validations;
  }
  getSourceCodeForNode(node) {
    if (!node?.data?.fileUri || !node?.data?.range) {
      return "";
    }
    try {
      const filePath = vscode3.Uri.parse(node.data.fileUri).fsPath;
      const fileContent = fs2.readFileSync(filePath, "utf8");
      const lines = fileContent.split(/\r?\n/);
      const start = node.data.range.start;
      const end = node.data.range.end;
      if (start.line >= lines.length || end.line >= lines.length) {
        return "";
      }
      if (start.line === end.line) {
        return lines[start.line].substring(start.character, end.character);
      }
      let text = lines[start.line].substring(start.character);
      for (let i = start.line + 1; i < end.line; i++) {
        text += "\n" + lines[i];
      }
      text += "\n" + lines[end.line].substring(0, end.character);
      return text;
    } catch (error) {
      return "";
    }
  }
  extractCollaborationPatterns(sourceCode, node) {
    const patterns = [];
    const methodCalls = sourceCode.match(/\.\w+\(\)/g);
    if (methodCalls && methodCalls.length > 3) {
      patterns.push(t("collaborations.intensiveCollaboration"));
    }
    if (sourceCode.includes("await ")) {
      patterns.push(t("collaborations.coordinatesAsync"));
    }
    if (sourceCode.includes("listen") || sourceCode.includes("stream")) {
      patterns.push(t("collaborations.listensReactively"));
    }
    return patterns;
  }
  /**
   * Clears the details panel content by sending clear command
   * to the webview. Used when focus is lost or diagram is closed.
   */
  clearDetails() {
    if (this.view) {
      this.view.webview.postMessage({ command: "clear" });
    }
  }
  updateLanguage() {
    if (this.view) {
      this.view.webview.html = this._getHtmlForWebview(this.view.webview);
    }
  }
  _getHtmlForWebview(webview) {
    log.debug(`Looking for details panel HTML file..`);
    try {
      const htmlPath = vscode3.Uri.joinPath(this._extensionUri, "media", "detailsView.html");
      log.debug(`[DEBUG] Path constructed: ${htmlPath.fsPath}`);
      if (!fs2.existsSync(htmlPath.fsPath)) {
        log.debug(`File not found! Make sure 'detailsView.html' is in your project root folder.`);
        return `<h1>Error: detailsView.html not found</h1>`;
      }
      log.debug(`[DEBUG] File found. Reading content...`);
      const translations = {
        "details.placeholder": t("details.placeholder"),
        "details.noCollaborations": t("details.noCollaborations"),
        "details.analysisOf": t("details.analysisOf"),
        "details.collaborations": t("details.collaborations"),
        "details.noValidRelations": t("details.noValidRelations"),
        "details.responsibilities": t("details.responsibilities"),
        "details.decisions": t("details.decisions"),
        "details.validations": t("details.validations"),
        "details.behaviors": t("details.behaviors"),
        "details.responsibilities.count": t("details.responsibilities.count"),
        "details.decisions.count": t("details.decisions.count"),
        "details.validations.count": t("details.validations.count"),
        "details.behaviors.count": t("details.behaviors.count"),
        "details.multipleComponents": t("details.multipleComponents"),
        "verb.extends": t("verb.extends"),
        "verb.implements": t("verb.implements"),
        "verb.calls": t("verb.calls"),
        "verb.readsFrom": t("verb.readsFrom"),
        "verb.writesTo": t("verb.writesTo"),
        "verb.instanceOf": t("verb.instanceOf"),
        "verb.usesAsType": t("verb.usesAsType"),
        "verb.unknown": t("verb.unknown"),
        "verb.reactsTo": t("verb.reactsTo"),
        "verb.showsUser": t("verb.showsUser"),
        "verb.buildsAndShows": t("verb.buildsAndShows"),
        "verb.managesState": t("verb.managesState"),
        "verb.delegates": t("verb.delegates"),
        "verb.notifies": t("verb.notifies"),
        "verb.composedOf": t("verb.composedOf"),
        "verb.formats": t("verb.formats"),
        "verb.assembles": t("verb.assembles"),
        "verb.reportsEvent": t("verb.reportsEvent"),
        "narrative.verb.showsUser": t("narrative.verb.showsUser"),
        "narrative.verb.readsFrom": t("narrative.verb.readsFrom"),
        "narrative.verb.buildsAndShows": t("narrative.verb.buildsAndShows"),
        "narrative.verb.instanceOf": t("narrative.verb.instanceOf"),
        "narrative.verb.notifies": t("narrative.verb.notifies"),
        "narrative.verb.delegates": t("narrative.verb.delegates"),
        "narrative.verb.formats": t("narrative.verb.formats"),
        "narrative.verb.managesState": t("narrative.verb.managesState"),
        "narrative.verb.reactsTo": t("narrative.verb.reactsTo"),
        "narrative.verb.implements": t("narrative.verb.implements"),
        "narrative.verb.extends": t("narrative.verb.extends"),
        "narrative.default": t("narrative.default"),
        "responsibilities.transformsData": t("responsibilities.transformsData"),
        "responsibilities.createsObjects": t("responsibilities.createsObjects"),
        "responsibilities.managesState": t("responsibilities.managesState"),
        "responsibilities.controlsNavigation": t("responsibilities.controlsNavigation"),
        "responsibilities.communicatesWithServices": t("responsibilities.communicatesWithServices"),
        "responsibilities.validatesInput": t("responsibilities.validatesInput"),
        "decisions.conditionalDecisions": t("decisions.conditionalDecisions"),
        "decisions.businessCases": t("decisions.businessCases"),
        "decisions.ternaryOperators": t("decisions.ternaryOperators"),
        "decisions.throwsExceptions": t("decisions.throwsExceptions"),
        "validations.checksEmpty": t("validations.checksEmpty"),
        "validations.checksLength": t("validations.checksLength"),
        "validations.preconditions": t("validations.preconditions"),
        "validations.preventsNull": t("validations.preventsNull"),
        "collaborations.intensiveCollaboration": t("collaborations.intensiveCollaboration"),
        "collaborations.coordinatesAsync": t("collaborations.coordinatesAsync"),
        "collaborations.listensReactively": t("collaborations.listensReactively")
      };
      let html = fs2.readFileSync(htmlPath.fsPath, "utf8");
      if (html.includes("window.translations || {")) {
        html = html.replace(
          "const translations = window.translations || {",
          `const translations = ${JSON.stringify(translations)} || {`
        );
      }
      return html;
    } catch (e) {
      log.debug(`[ERROR] Catastrophic failure loading details view: ${e.message}`);
      return `<h1>Critical Error: ${e.message}</h1>`;
    }
  }
};

// src/filesystem/directory_scanner.ts
var vscode5 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));

// src/filesystem/project_finder.ts
var vscode4 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));

// src/filesystem/pattern_matcher.ts
var path2 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));
function findProjectRootWithPubspec(startPath) {
  log.debug(`[Project Root] Searching for pubspec.yaml from${startPath}`);
  try {
    let currentPath = startPath;
    const maxLevels = 10;
    let level = 0;
    while (level < maxLevels) {
      const pubspecPath = path2.join(currentPath, "pubspec.yaml");
      if (fs3.existsSync(pubspecPath)) {
        log.debug(`\u2705 Found pubspec.yaml in: ${currentPath}`);
        return currentPath;
      }
      const parentPath = path2.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
      level++;
    }
    log.debug(`\u26A0\uFE0F Could not find pubspec.yaml searching from: ${startPath}`);
    return null;
  } catch (err) {
    log.debug("---");
    log.debug(`\u274C [Project Root] CRITICAL ERROR while searching for the project root.`);
    if (err instanceof Error) {
      log.debug(`   Error message: ${err.message}`);
    } else {
      log.debug(`   Unknown error: ${String(err)}`);
    }
    log.debug("---");
    return null;
  }
}
async function findDirectoriesByPattern(globPattern) {
  const directories = [];
  const parts = globPattern.split(path2.sep);
  const basePath = parts[0];
  if (!fs3.existsSync(basePath)) {
    return directories;
  }
  function searchRecursive(currentPath, remainingParts) {
    if (remainingParts.length === 0) {
      if (fs3.existsSync(currentPath) && fs3.statSync(currentPath).isDirectory()) {
        directories.push(currentPath);
      }
      return;
    }
    const [nextPart, ...restParts] = remainingParts;
    if (nextPart === "*") {
      try {
        const entries = fs3.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            const subPath = path2.join(currentPath, entry.name);
            searchRecursive(subPath, restParts);
          }
        }
      } catch {
      }
    } else {
      const specificPath = path2.join(currentPath, nextPart);
      if (fs3.existsSync(specificPath)) {
        searchRecursive(specificPath, restParts);
      }
    }
  }
  searchRecursive(basePath, parts.slice(1));
  return directories;
}

// src/filesystem/project_finder.ts
async function searchNestedCustomDirectories(projectRoot, customDirectories) {
  const commonPatterns = [
    "packages/*/lib",
    "modules/*/lib",
    "features/*/lib",
    "apps/*/lib",
    "plugins/*/lib",
    "shared/*/lib"
  ];
  for (const pattern of commonPatterns) {
    try {
      const globPattern = path3.join(projectRoot, pattern);
      const matchingDirs = await findDirectoriesByPattern(globPattern);
      for (const dir of matchingDirs) {
        if (await containsDartFiles(dir)) {
          const parentDir = path3.dirname(dir);
          const parentUri = vscode4.Uri.file(parentDir);
          if (!customDirectories.some((existing) => existing.fsPath === parentDir)) {
            customDirectories.push(parentUri);
            log.debug(`\u{1F4E6} Modular directory found: ${path3.relative(projectRoot, parentDir)}`);
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
}

// src/filesystem/directory_scanner.ts
async function findCustomDartDirectories(rootUri) {
  const customDirectories = [];
  const projectRoot = rootUri.fsPath;
  const standardDirs = /* @__PURE__ */ new Set([
    "lib",
    "test",
    "example",
    "tool",
    "bin",
    "integration_test",
    ".dart_tool",
    "build",
    ".packages",
    "node_modules"
  ]);
  try {
    const allEntries = fs4.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of allEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dirName = entry.name;
      if (dirName.startsWith(".") || dirName.startsWith("_") || standardDirs.has(dirName) || dirName === "android" || dirName === "ios" || dirName === "web" || dirName === "windows" || dirName === "macos" || dirName === "linux") {
        continue;
      }
      const fullDirPath = path4.join(projectRoot, dirName);
      if (await containsDartFiles(fullDirPath)) {
        const dirUri = vscode5.Uri.file(fullDirPath);
        customDirectories.push(dirUri);
        log.debug(`\u{1F50D} Custom directory found: ${dirName}`);
      }
    }
    await searchNestedCustomDirectories(projectRoot, customDirectories);
  } catch (error) {
    log.error(`\u26A0\uFE0F Error scanning custom directories: ${error}`);
  }
  return customDirectories;
}
async function containsDartFiles(dirPath, maxDepth = 3) {
  if (maxDepth <= 0 || !fs4.existsSync(dirPath)) {
    return false;
  }
  try {
    const entries = fs4.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".dart")) {
        return true;
      }
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const subDirPath = path4.join(dirPath, entry.name);
        if (await containsDartFiles(subDirPath, maxDepth - 1)) {
          return true;
        }
      }
    }
  } catch (error) {
    return false;
  }
  return false;
}

// src/packages/package_files.ts
var fs5 = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var vscode6 = __toESM(require("vscode"));
function findDartFilesInPackage(libPath, maxFiles = 20) {
  const dartFiles = [];
  try {
    let searchRecursive2 = function(currentPath, depth = 0) {
      if (depth > 3 || dartFiles.length >= maxFiles) {
        return;
      }
      const entries = fs5.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (dartFiles.length >= maxFiles) {
          break;
        }
        if (entry.isFile() && entry.name.endsWith(".dart")) {
          dartFiles.push(import_path.default.join(currentPath, entry.name));
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          searchRecursive2(import_path.default.join(currentPath, entry.name), depth + 1);
        }
      }
    };
    var searchRecursive = searchRecursive2;
    searchRecursive2(libPath);
  } catch (error) {
  }
  return dartFiles;
}
function extractPackageImportsFromFile(fileUri) {
  try {
    const filePath = vscode6.Uri.parse(fileUri).fsPath;
    const fileContent = fs5.readFileSync(filePath, "utf8");
    const importRegex = /import\s+['"]package:([\w]+)\//g;
    const imports = /* @__PURE__ */ new Set();
    let match;
    while ((match = importRegex.exec(fileContent)) !== null) {
      imports.add(match[1]);
    }
    return Array.from(imports);
  } catch (e) {
    return [];
  }
}

// src/ui/webview_creator.ts
var vscode24 = __toESM(require("vscode"));
var fs14 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));

// src/analysis/validation.ts
var vscode7 = __toESM(require("vscode"));
function validateEnrichedData(enrichedFiles) {
  const symbolMap = /* @__PURE__ */ new Map();
  function recurse(symbols) {
    for (const sym of symbols) {
      if (sym.uniqueId) {
        symbolMap.set(sym.uniqueId, sym);
      }
      if (sym.kind === vscode7.SymbolKind.Class) {
        log.debug(`[VALIDATE] Class: ${sym.name}`);
      }
      if (sym.kind === vscode7.SymbolKind.Constructor) {
        if (!sym.parameters && sym.detail) {
          log.debug(`[WARN] Constructor '${sym.name}' has detail but no parameters were extracted.`);
        }
        if (sym.parentId) {
          const parent = symbolMap.get(sym.parentId);
          if (!parent) {
            log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
          } else {
            if (parent.kind !== vscode7.SymbolKind.Class) {
              log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not a class (kind: ${parent.kind}, expected: ${vscode7.SymbolKind.Class})`);
            }
            if (Array.isArray(sym.parameters) && Array.isArray(parent.children)) {
              const parentFields = new Set(parent.children.map((c) => c.name));
              for (const param of sym.parameters) {
                if (param.name && !parentFields.has(param.name)) {
                  log.debug(`[WARN] Constructor '${sym.name}' has parameter '${param.name}' not found as property in '${parent.name}'`);
                }
              }
            }
          }
        }
      }
      if (sym.parentId && !symbolMap.has(sym.parentId)) {
        log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
      }
      if (sym.children) {
        recurse(sym.children);
      }
    }
  }
  try {
    for (const file of enrichedFiles) {
      recurse(file.symbols);
    }
  } catch (err) {
    log.error(`Error running validateEnrichedData: ${err}`);
  }
}

// src/core/constants.ts
var vscode8 = __toESM(require("vscode"));
var KIND_CLASS = vscode8.SymbolKind.Class;
var KIND_ENUM = vscode8.SymbolKind.Enum;
var KIND_METHOD = vscode8.SymbolKind.Method;
var KIND_FUNCTION = vscode8.SymbolKind.Function;
var KIND_CONSTRUCTOR = vscode8.SymbolKind.Constructor;
var KIND_FIELD = vscode8.SymbolKind.Field;
var KIND_PROPERTY = vscode8.SymbolKind.Property;
var KIND_EXTENSION = vscode8.SymbolKind.Namespace;
var KIND_TYPEDEF = 22;

// src/core/symbol_utils.ts
function generateGlobalSymbolId(symbol, parentName) {
  const fileUri = symbol.fileUri || "unknown_uri";
  let symbolNamePart = symbol.name;
  const kindPrefix = getKindPrefix(symbol.kind);
  if (symbol.kind === KIND_CONSTRUCTOR && symbolNamePart === parentName) {
    symbolNamePart = "_default_";
  }
  return parentName ? `${fileUri}#parent:${parentName}#kind:${kindPrefix}#name:${symbolNamePart}` : `${fileUri}#kind:${kindPrefix}#name:${symbolNamePart}`;
}
function getKindPrefix(kind) {
  const map = { 5: "class", 6: "method", 12: "func", 9: "ctor", 8: "field", 7: "prop", 10: "enum", 3: "ext", 22: "typedef" };
  return map[kind] || `k${kind}`;
}
function SymbolKindToString(kind) {
  const map = {
    [KIND_CLASS]: "class",
    [KIND_METHOD]: "method",
    [KIND_FUNCTION]: "function",
    [KIND_CONSTRUCTOR]: "constructor",
    [KIND_FIELD]: "field",
    [KIND_PROPERTY]: "property",
    [KIND_ENUM]: "enum",
    [KIND_TYPEDEF]: "typedef",
    [KIND_EXTENSION]: "namespace"
  };
  return map[kind] || `kind_${kind}`;
}

// src/core/text_utils.ts
function parseBaseTypeName(typeString) {
  if (!typeString) {
    return void 0;
  }
  let currentType = typeString.trim().replace(/\?$/, "");
  const genericMatch = currentType.match(/^[\w\s]+\s*<(.+)>$/);
  if (genericMatch?.[1]) {
    const innerType = parseBaseTypeName(genericMatch[1]);
    if (innerType) {
      return innerType;
    }
  }
  return currentType.split(".").pop()?.split(" ").pop() || currentType;
}
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripCommentsAndStrings(code) {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(["'`])(?:\\.|[^\\])*?\1/g, "");
}

// src/core/json_utils.ts
function sanitizeStringForJSON(str) {
  if (typeof str !== "string") {
    return str;
  }
  let sanitized = str.replace(/[\x00-\x07\x0b\x0e-\x1f\x7f]/g, function(char) {
    return "\\u" + ("0000" + char.charCodeAt(0).toString(16)).slice(-4);
  });
  sanitized = sanitized.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\f/g, "\\f").replace(/\x08/g, "\\b");
  return sanitized;
}
function sanitizeObjectStrings(obj) {
  if (obj === null || typeof obj !== "object") {
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const val = obj[i];
      if (typeof val === "string") {
        obj[i] = sanitizeStringForJSON(val);
      } else if (typeof val === "object") {
        sanitizeObjectStrings(val);
      }
    }
  } else {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === "string") {
          obj[key] = sanitizeStringForJSON(value);
        } else if (typeof value === "object") {
          sanitizeObjectStrings(value);
        }
      }
    }
  }
}

// src/core/graph_algorithms.ts
function calculateNodeDegrees(graph) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    node.inDegree = 0;
    node.outDegree = 0;
  }
  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode) {
      sourceNode.outDegree++;
    }
    if (targetNode) {
      targetNode.inDegree++;
    }
  }
}

// src/core/concurrency.ts
var defaultSleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
async function retryUntil(operation, isDone, delaysMs, sleep2 = defaultSleep) {
  let result = await operation();
  let attempts = 1;
  for (const delay of delaysMs) {
    if (isDone(result)) {
      return { result, attempts, exhausted: false };
    }
    await sleep2(delay);
    result = await operation();
    attempts++;
  }
  return { result, attempts, exhausted: !isDone(result) };
}
async function mapLimited(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
      done++;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}

// src/graph/graph_builder.ts
var vscode16 = __toESM(require("vscode"));

// src/graph/layer_classifier.ts
var vscode9 = __toESM(require("vscode"));
var path6 = __toESM(require("path"));

// src/analysis/state_managers.ts
var BASES = {
  bloc: "bloc",
  cubit: "bloc",
  hydratedbloc: "bloc",
  hydratedcubit: "bloc",
  replaybloc: "bloc",
  replaycubit: "bloc",
  changenotifier: "provider",
  valuenotifier: "provider",
  statenotifier: "riverpod",
  notifier: "riverpod",
  asyncnotifier: "riverpod",
  autodisposenotifier: "riverpod",
  autodisposeasyncnotifier: "riverpod",
  getxcontroller: "getx",
  getxservice: "getx",
  rxcontroller: "getx"
};
function detectStateManager(relations) {
  if (!relations) {
    return void 0;
  }
  for (const list of [relations.extends, relations.with, relations.implements]) {
    for (const rel of list ?? []) {
      const written = (typeof rel === "string" ? rel : rel.name).split("<")[0].trim();
      const family = BASES[written.toLowerCase()];
      if (family) {
        return { family, base: written };
      }
    }
  }
  return void 0;
}

// src/filesystem/exclusions.ts
var DEFAULT_EXCLUDES = [
  "**/*.g.dart",
  "**/*.freezed.dart",
  "**/*.gr.dart",
  "**/*.mocks.dart",
  "**/*.config.dart",
  "**/*.chopper.dart",
  "**/*.reflectable.dart",
  "**/generated/**",
  "**/.dart_tool/**"
];
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`, "i");
}
function makeExcluder(patterns) {
  const regexes = patterns.filter((p) => p.trim() !== "").map(globToRegExp);
  return (relativePath) => {
    const normalized = relativePath.replace(/\\/g, "/");
    return regexes.some((r) => r.test(normalized));
  };
}

// src/analysis/architecture_presets.ts
var COMMON_NEUTRAL = {
  id: "core",
  label: "Core",
  neutral: true,
  description: "Shared code. Takes no part in the rules.",
  folders: ["**/core/**", "**/utils/**", "**/shared/**", "**/common/**", "**/helpers/**"]
};
var PRESETS = {
  // The four layers Satori always had, written out so they can be extended.
  default: {
    description: "View, State, Service and Model, placed by Satori's own guess. Using a layer above yours is a violation.",
    layers: [{ id: "view" }, { id: "state" }, { id: "service" }, { id: "model" }, { id: "utility", neutral: true }],
    mode: "order",
    allow: [],
    heuristic: { view: "view", state: "state", service: "service", model: "model", utility: "utility" }
  },
  // Presentation and data both depend on the domain; the domain depends on nothing.
  clean: {
    description: "Clean Architecture: presentation and data depend on the domain, the domain on nothing.",
    layers: [
      {
        id: "presentation",
        label: "Presentation",
        color: "#1e88e5",
        icon: "layer-view",
        description: "Screens, widgets and their state. May use the domain, never the data layer directly.",
        folders: ["**/presentation/**", "**/pages/**", "**/screens/**", "**/views/**", "**/widgets/**", "**/ui/**"],
        names: ["*Page", "*Screen", "*View"]
      },
      {
        id: "domain",
        label: "Domain",
        color: "#8e24aa",
        description: "Entities and business rules. Depends on nothing else.",
        folders: ["**/domain/**", "**/entities/**", "**/usecases/**", "**/use_cases/**"],
        names: ["*UseCase", "*Entity"]
      },
      {
        id: "data",
        label: "Data",
        color: "#43a047",
        icon: "layer-model",
        description: "Repositories, data sources and DTOs. May use the domain.",
        folders: ["**/data/**", "**/repositories/**", "**/datasources/**", "**/data_sources/**"],
        names: ["*Repository*", "*DataSource*", "*Dto"]
      },
      COMMON_NEUTRAL
    ],
    mode: "allow",
    allow: [["presentation", "domain"], ["data", "domain"]],
    heuristic: { view: "presentation", state: "presentation", service: "data", model: "domain", utility: "core" }
  },
  // View -> view model -> model, one way.
  mvvm: {
    description: "MVVM: views use view models, view models use the model. Never the other way round.",
    layers: [
      {
        id: "view",
        label: "View",
        color: "#1e88e5",
        icon: "layer-view",
        description: "Screens and widgets. Show what the view model exposes.",
        folders: ["**/views/**", "**/pages/**", "**/screens/**", "**/widgets/**", "**/ui/**"],
        extends: ["StatelessWidget", "StatefulWidget"],
        names: ["*Page", "*Screen", "*View"]
      },
      {
        id: "viewmodel",
        label: "View model",
        color: "#fbc02d",
        icon: "layer-state",
        description: "State and logic of a screen. Uses the model, knows nothing of widgets.",
        folders: ["**/viewmodels/**", "**/view_models/**", "**/viewmodel/**", "**/blocs/**", "**/cubits/**", "**/controllers/**", "**/providers/**", "**/state/**"],
        names: ["*ViewModel", "*Bloc", "*Cubit", "*Controller", "*Notifier"]
      },
      {
        id: "model",
        label: "Model",
        color: "#e64a19",
        icon: "layer-model",
        description: "Data, repositories and services.",
        folders: ["**/models/**", "**/repositories/**", "**/services/**", "**/data/**", "**/domain/**"],
        names: ["*Model", "*Repository*", "*Service"]
      },
      COMMON_NEUTRAL
    ],
    mode: "order",
    allow: [],
    heuristic: { view: "view", state: "viewmodel", service: "model", model: "model", utility: "core" }
  }
};
var LIST_KEYS = ["folders", "names", "extends"];
function mergeLayers(base, extra) {
  const merged = base.map((l) => ({ ...l }));
  const neutralAt = merged.findIndex((l) => l.neutral);
  for (const item of extra) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") {
      continue;
    }
    const existing = merged.find((l) => l.id === item.id);
    if (!existing) {
      const at = neutralAt >= 0 ? merged.findIndex((l) => l.neutral) : merged.length;
      merged.splice(at, 0, { ...item });
      continue;
    }
    for (const [key, value] of Object.entries(item)) {
      if (LIST_KEYS.includes(key) && Array.isArray(value)) {
        const current = existing[key];
        existing[key] = [...value, ...current ?? []];
      } else {
        existing[key] = value;
      }
    }
  }
  return merged;
}
var ROLES = [
  { rank: 0, names: /^(views?|pages?|screens?|ui|widgets?|presentation|components?)$/ },
  { rank: 1, names: /^(view_?models?|blocs?|cubits?|controllers?|providers?|state|states|stores?|notifiers?)$/ },
  { rank: 2, names: /^(use_?cases?|domain|logic|business|services?|interactors?)$/ },
  { rank: 3, names: /^(repositor(y|ies)|data|data_?sources?|api|network|remote|local|infra(structure)?)$/ },
  { rank: 4, names: /^(models?|entit(y|ies)|dtos?)$/ }
];
var NEUTRAL_NAMES = /^(core|utils?|shared|common|helpers?|config|configs?|constants?|extensions?|theme|themes?|l10n|generated|assets|routes?|router|di|injection|mixins?)$/;
var UNKNOWN_RANK = 2.5;
var MAX_LAYERS = 12;
function layerId(name) {
  const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+/, "");
  return id === "" ? "folder" : id.slice(0, 32);
}
function layerLabel(name) {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function layersFromFolders(base, folders) {
  const used = /* @__PURE__ */ new Set(["core"]);
  const own = [];
  const shared = [];
  for (const name of [...new Set(folders)].sort()) {
    if (name.startsWith(".")) {
      continue;
    }
    const lower = name.toLowerCase();
    if (NEUTRAL_NAMES.test(lower)) {
      shared.push(`${base}/${name}/**`);
      continue;
    }
    if (own.length >= MAX_LAYERS) {
      shared.push(`${base}/${name}/**`);
      continue;
    }
    let id = layerId(name);
    for (let i = 2; used.has(id); i++) {
      id = `${layerId(name).slice(0, 28)}-${i}`;
    }
    used.add(id);
    const role = ROLES.find((r) => r.names.test(lower));
    own.push({ spec: { id, label: layerLabel(name), folders: [`${base}/${name}/**`] }, rank: role ? role.rank : UNKNOWN_RANK, name });
  }
  own.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return [
    ...own.map((o) => o.spec),
    { id: "core", label: "Core", neutral: true, description: "Shared code and whatever is outside the folders above. Takes no part in the rules.", folders: shared }
  ];
}

// src/analysis/architecture_config.ts
var BUILTIN_LAYER_IDS = ["view", "state", "service", "model", "utility"];
function defaultArchitecture() {
  return {
    layers: [
      { id: "view" },
      { id: "state" },
      { id: "service" },
      { id: "model" },
      { id: "utility", neutral: true }
    ],
    mode: "order",
    allow: [],
    forbid: [],
    neutral: "utility",
    overrides: {},
    heuristic: { view: "view", state: "state", service: "service", model: "model", utility: "utility" },
    builtin: true
  };
}
var KNOWN_ICONS = ["layer-view", "layer-state", "layer-service", "layer-model", "layer-utility", "layer-generic"];
var ID = /^[a-z][a-z0-9_-]{0,31}$/;
var COLOR = /^#[0-9a-fA-F]{6}$/;
function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : void 0;
}
function pairs(value, known, what, problems) {
  const out = [];
  if (value === void 0) {
    return out;
  }
  if (!Array.isArray(value)) {
    problems.push(`"${what}" must be a list of [from, to] pairs.`);
    return out;
  }
  for (const item of value) {
    if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && typeof item[1] === "string") {
      if (!known.has(item[0]) || !known.has(item[1])) {
        problems.push(`"${what}" names a layer that does not exist: ${item[0]} -> ${item[1]}.`);
      } else {
        out.push([item[0], item[1]]);
      }
    } else {
      problems.push(`"${what}" has an entry that is not a [from, to] pair.`);
    }
  }
  return out;
}
function parseArchitecture(text, context = {}) {
  if (text === void 0 || text.trim() === "") {
    return { architecture: defaultArchitecture(), problems: [] };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { architecture: defaultArchitecture(), problems: [`satori.json is not valid JSON (${e.message}). The default layers are used.`] };
  }
  const section = raw && typeof raw === "object" ? raw.architecture : void 0;
  if (section === void 0) {
    return { architecture: defaultArchitecture(), problems: [] };
  }
  if (!section || typeof section !== "object") {
    return { architecture: defaultArchitecture(), problems: ['"architecture" must be an object. The default layers are used.'] };
  }
  const problems = [];
  let rawLayers = Array.isArray(section.layers) ? section.layers : [];
  let presetRules = {};
  let presetHeuristic;
  if (section.preset === "folders") {
    const found = context.discoverFolders?.();
    if (!found || found.folders.length === 0) {
      problems.push('"preset": "folders" needs a lib/ folder with subfolders, and none was found.');
    } else {
      rawLayers = mergeLayers(layersFromFolders(found.base, found.folders), rawLayers);
      presetRules = { mode: "none", allow: [] };
      presetHeuristic = {};
    }
  } else if (section.preset !== void 0) {
    const preset = typeof section.preset === "string" ? PRESETS[section.preset] : void 0;
    if (!preset) {
      problems.push(`"preset" must be one of: ${[...Object.keys(PRESETS), "folders"].join(", ")} (got ${JSON.stringify(section.preset)}).`);
    } else {
      rawLayers = mergeLayers(preset.layers, rawLayers);
      presetRules = { mode: preset.mode, allow: preset.allow };
      presetHeuristic = preset.heuristic;
    }
  }
  if (rawLayers.length === 0) {
    return { architecture: defaultArchitecture(), problems: [...problems, '"architecture.layers" must be a list with at least one layer, or "architecture.preset" must name one. The default layers are used.'] };
  }
  const layers = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of rawLayers) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !ID.test(item.id)) {
      problems.push(`A layer needs an "id" of lowercase letters, digits, "-" or "_" (got ${JSON.stringify(item && item.id)}).`);
      continue;
    }
    if (seen.has(item.id)) {
      problems.push(`The layer "${item.id}" is written twice; the second one is ignored.`);
      continue;
    }
    seen.add(item.id);
    const spec = { id: item.id };
    if (typeof item.label === "string") {
      spec.label = item.label;
    }
    if (typeof item.description === "string") {
      spec.description = item.description;
    }
    if (typeof item.color === "string") {
      if (COLOR.test(item.color)) {
        spec.color = item.color.toLowerCase();
      } else {
        problems.push(`The colour of "${item.id}" must look like #1e88e5.`);
      }
    }
    if (typeof item.icon === "string") {
      if (KNOWN_ICONS.includes(item.icon)) {
        spec.icon = item.icon;
      } else {
        problems.push(`The icon of "${item.id}" must be one of: ${KNOWN_ICONS.join(", ")}.`);
      }
    }
    const folders = strings(item.folders);
    if (folders) {
      spec.folders = folders;
    }
    const ext = strings(item.extends);
    if (ext) {
      spec.extends = ext;
    }
    const names = strings(item.names);
    if (names) {
      spec.names = names;
    }
    if (item.neutral === true) {
      spec.neutral = true;
    }
    layers.push(spec);
  }
  if (layers.length === 0) {
    return { architecture: defaultArchitecture(), problems: [...problems, "No valid layer was found. The default layers are used."] };
  }
  let neutral = layers.find((l) => l.neutral)?.id;
  if (!neutral) {
    const existing = layers.find((l) => l.id === "other");
    if (existing) {
      existing.neutral = true;
    } else {
      layers.push({ id: "other", label: "Other", neutral: true });
      seen.add("other");
    }
    neutral = "other";
  }
  layers.forEach((l) => {
    if (l.id !== neutral) {
      delete l.neutral;
    }
  });
  const known = new Set(layers.map((l) => l.id));
  const fileRules = section.rules && typeof section.rules === "object" ? section.rules : {};
  const rules = { ...presetRules, ...fileRules };
  let mode = "order";
  if (rules.mode === "allow" || rules.mode === "none") {
    mode = rules.mode;
  } else if (rules.mode !== void 0 && rules.mode !== "order") {
    problems.push('"rules.mode" must be "order", "allow" or "none"; "order" is used.');
  }
  const overrides2 = {};
  if (section.overrides && typeof section.overrides === "object") {
    for (const [name, layer] of Object.entries(section.overrides)) {
      if (typeof layer === "string" && known.has(layer)) {
        overrides2[name] = layer;
      } else {
        problems.push(`"overrides" puts ${name} in a layer that does not exist (${String(layer)}).`);
      }
    }
  }
  const heuristic = {};
  if (section.heuristic === false) {
  } else if (section.heuristic && typeof section.heuristic === "object") {
    for (const [from, to] of Object.entries(section.heuristic)) {
      if (!BUILTIN_LAYER_IDS.includes(from)) {
        problems.push(`"heuristic" does not know "${from}"; use view, state, service, model or utility.`);
      } else if (typeof to === "string" && known.has(to)) {
        heuristic[from] = to;
      } else {
        problems.push(`"heuristic" sends ${from} to a layer that does not exist (${String(to)}).`);
      }
    }
  } else if (presetHeuristic) {
    for (const [from, to] of Object.entries(presetHeuristic)) {
      if (known.has(to)) {
        heuristic[from] = to;
      }
    }
  } else {
    for (const id of BUILTIN_LAYER_IDS) {
      if (known.has(id)) {
        heuristic[id] = id;
      }
    }
  }
  return {
    architecture: {
      layers,
      mode,
      allow: pairs(rules.allow, known, "rules.allow", problems),
      forbid: pairs(rules.forbid, known, "rules.forbid", problems),
      neutral,
      overrides: overrides2,
      heuristic,
      builtin: false
    },
    problems
  };
}
function namePattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function layerFor(arch, facts) {
  const byName = arch.overrides[facts.name];
  if (byName) {
    return byName;
  }
  const path21 = facts.path.replace(/\\/g, "/");
  for (const layer of arch.layers) {
    if ((layer.folders ?? []).some((g) => globToRegExp(g).test(path21))) {
      return layer.id;
    }
  }
  for (const layer of arch.layers) {
    if ((layer.extends ?? []).some((e) => facts.parents.includes(e))) {
      return layer.id;
    }
  }
  for (const layer of arch.layers) {
    if ((layer.names ?? []).some((p) => namePattern(p).test(facts.name))) {
      return layer.id;
    }
  }
  return arch.heuristic[facts.guess] ?? arch.neutral;
}

// src/graph/layer_classifier.ts
var architecture = null;
var projectRootPath = "";
function setArchitecture(arch, projectRoot = "") {
  architecture = arch;
  projectRootPath = projectRoot;
}
function parentNames(relations) {
  return [...relations?.extends ?? [], ...relations?.implements ?? [], ...relations?.with ?? []].map((r) => (typeof r === "string" ? r : r.name).split("<")[0].trim());
}
function classifyLayer(symbol, relations) {
  const guess = getArchitecturalLayer(symbol, relations);
  if (guess === "member" || !architecture || architecture.builtin) {
    return guess;
  }
  const file = symbol.fileUri ? vscode9.Uri.parse(symbol.fileUri).fsPath : "";
  const relative3 = projectRootPath && file ? path6.relative(projectRootPath, file) : file;
  return layerFor(architecture, { name: symbol.name, path: relative3, parents: parentNames(relations), guess });
}
function getArchitecturalLayer(symbol, relations) {
  if (symbol.kind !== vscode9.SymbolKind.Class && symbol.kind !== vscode9.SymbolKind.Enum) {
    return "member";
  }
  const name = symbol.name.toLowerCase();
  const allRelations = [
    ...relations?.extends || [],
    ...relations?.implements || [],
    ...relations?.with || []
  ].map((r) => (typeof r === "string" ? r : r.name).toLowerCase().split("<")[0]);
  if (allRelations.includes("statelesswidget") || allRelations.includes("statefulwidget") || allRelations.includes("hookwidget") || allRelations.includes("widget")) {
    return "view";
  }
  if (symbol.kind === vscode9.SymbolKind.Class && symbol.children) {
    const hasBuildMethod = symbol.children.some(
      (c) => c.kind === vscode9.SymbolKind.Method && c.name === "build"
    );
    if (hasBuildMethod) {
      return "view";
    }
  }
  if (allRelations.some(
    (rel) => rel.includes("widget") || rel.includes("component") || rel.includes("renderobject") || rel.includes("sliver")
  )) {
    return "view";
  }
  if (name.endsWith("page") || name.endsWith("screen") || name.endsWith("view") || name.endsWith("widget") || name.endsWith("dialog") || name.endsWith("modal") || name.endsWith("bottomsheet") || name.endsWith("drawer")) {
    return "view";
  }
  if (name.includes("page") || name.includes("screen") || name.includes("widget") || name.includes("dialog")) {
    return "view";
  }
  if (detectStateManager(relations)) {
    return "state";
  }
  if (allRelations.includes("changenotifier") || allRelations.includes("statenotifier") || allRelations.includes("bloc") || allRelations.includes("cubit") || allRelations.includes("provider") || allRelations.includes("controller")) {
    return "state";
  }
  if (symbol.kind === vscode9.SymbolKind.Class && symbol.children) {
    const hasStateStream = symbol.children.some(
      (c) => (c.kind === vscode9.SymbolKind.Field || c.kind === vscode9.SymbolKind.Property) && (c.name === "stream" || c.name === "state")
    );
    const hasEventMethod = symbol.children.some(
      (c) => c.kind === vscode9.SymbolKind.Method && (c.name === "add" || c.name === "emit" || c.name === "on")
    );
    if (hasStateStream && hasEventMethod) {
      return "state";
    }
  }
  if (name.endsWith("bloc") || name.endsWith("cubit") || name.endsWith("provider") || name.endsWith("controller") || name.endsWith("manager") || name.endsWith("viewmodel") || name.endsWith("notifier") || name.endsWith("store") || name.endsWith("reducer") || name.endsWith("state")) {
    return "state";
  }
  if (name.includes("bloc") || name.includes("cubit") || name.includes("provider") || name.includes("controller") || name.includes("notifier") || name.includes("state")) {
    return "state";
  }
  if (symbol.kind === vscode9.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode9.SymbolKind.Method);
    const asyncMethods = methods.filter(
      (m) => m.returnType?.toLowerCase().includes("future") || m.returnType?.toLowerCase().includes("stream") || m.name.toLowerCase().includes("async")
    );
    if (methods.length > 0 && asyncMethods.length / methods.length >= 0.5) {
      return "service";
    }
  }
  if (allRelations.some(
    (rel) => rel.includes("service") || rel.includes("repository") || rel.includes("client") || rel.includes("adapter") || rel.includes("gateway")
  )) {
    return "service";
  }
  if (name.endsWith("service") || name.endsWith("repository") || name.endsWith("api") || name.endsWith("datasource") || name.endsWith("client") || name.endsWith("gateway") || name.endsWith("adapter") || name.endsWith("helper") || name.endsWith("manager") || name.endsWith("handler")) {
    return "service";
  }
  if (name.includes("service") || name.includes("repository") || name.includes("api") || name.includes("client") || name.includes("gateway") || name.includes("adapter")) {
    return "service";
  }
  if (symbol.kind === vscode9.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode9.SymbolKind.Method);
    const fields = symbol.children.filter(
      (c) => c.kind === vscode9.SymbolKind.Field || c.kind === vscode9.SymbolKind.Property
    );
    const businessMethods = methods.filter(
      (m) => !["toString", "hashcode", "operator==", "copyWith", "toJson", "fromJson"].includes(m.name.toLowerCase())
    );
    if (fields.length > 0 && businessMethods.length <= 2) {
      return "model";
    }
  }
  if (name.endsWith("model") || name.endsWith("entity") || name.endsWith("dto") || name.endsWith("data") || name.endsWith("response") || name.endsWith("request") || name.endsWith("event") || name.endsWith("state") || name.endsWith("vo") || name.endsWith("pojo")) {
    return "model";
  }
  if (name.includes("model") || name.includes("entity") || name.includes("dto") || name.includes("data")) {
    return "model";
  }
  if (symbol.kind === vscode9.SymbolKind.Enum) {
    return "model";
  }
  if (name.endsWith("util") || name.endsWith("utils") || name.endsWith("helper") || name.endsWith("extension") || name.endsWith("mixin") || name.endsWith("constants") || name.endsWith("config") || name.endsWith("settings")) {
    return "utility";
  }
  if (symbol.kind === vscode9.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode9.SymbolKind.Method);
    const staticMethods = methods.filter(
      (m) => m.detail?.toLowerCase().includes("static")
    );
    if (methods.length > 0 && staticMethods.length / methods.length >= 0.7) {
      return "utility";
    }
  }
  return "utility";
}

// src/graph/node_creator.ts
function createGraphNodesFromSymbols(enrichedFiles, projectGraph, symbolMapById, generateGlobalSymbolId2, generatedNodeIds) {
  function recursive(symbols, parentClass, fileUri) {
    if (!symbols) {
      return;
    }
    for (const s of symbols) {
      s.fileUri = s.fileUri || fileUri;
      const nodeId = generateGlobalSymbolId2(s, parentClass?.name);
      const parentId = parentClass ? generateGlobalSymbolId2(parentClass, void 0) : void 0;
      if (parentClass) {
        log.debug(`[DEBUG-PARENT] ${s.name} has parent${parentClass.name}`);
        log.debug(`[DEBUG-PARENT-ID] ${s.name} -> parentId: ${parentId}`);
      } else {
        log.debug(`[DEBUG-PARENT] ${s.name} has no parent (is top-level)`);
      }
      if (!generatedNodeIds.has(nodeId)) {
        generatedNodeIds.add(nodeId);
        const layer = classifyLayer(s, s.relations);
        log.debug(`[DEBUG-RECURSIVE-PARENT] Processing: ${s.name}, parentClass: ${parentClass?.name ?? "none"}`);
        const stateManager = s.kind === KIND_CLASS ? detectStateManager(s.relations) : void 0;
        const node = {
          id: nodeId,
          label: s.name,
          kind: SymbolKindToString(s.kind),
          data: {
            fileUri: s.fileUri,
            range: s.range,
            selectionRange: s.selectionRange,
            isSDK: !!s.isSDK,
            access: s.access,
            layer,
            ...stateManager ? { stateManager } : {}
          },
          parent: parentId
        };
        log.debug(`[DEBUG-GRAPH] Agdding node: ${node.label}, Layer: ${layer}, Parent: ${node.parent}`);
        log.debug(`[DEBUG-KIND] ${s.name} (kind: ${SymbolKindToString(s.kind)})`);
        projectGraph.nodes.push(node);
      }
      symbolMapById.set(nodeId, s);
      const isContainerSymbol = s.kind === KIND_CLASS || s.kind === KIND_ENUM || (s.children?.length ?? 0) > 0;
      const nextParent = isContainerSymbol ? s : parentClass;
      if (s.children) {
        recursive(s.children, nextParent, s.fileUri);
      }
    }
  }
  for (const file of enrichedFiles) {
    recursive(file.symbols, void 0, file.fileUri);
  }
}

// src/analysis/source_analyzer.ts
var vscode10 = __toESM(require("vscode"));
var fs6 = __toESM(require("fs"));

// src/analysis/type_usage.ts
function typeUsage(source, classNames, ownName) {
  const created = /* @__PURE__ */ new Set();
  const used = /* @__PURE__ */ new Set();
  for (const match of source.matchAll(/(?<![\w$.])([A-Z][\w$]*)/g)) {
    const name = match[1];
    if (!classNames.has(name) || name === ownName) {
      continue;
    }
    let rest = source.slice(match.index + name.length);
    const generics = skipGenerics(rest);
    rest = rest.slice(generics);
    const next = /^\s*(.)/.exec(rest)?.[1];
    if (next === "(") {
      created.add(name);
    } else if (next === ".") {
      continue;
    } else {
      used.add(name);
    }
  }
  return { created: Array.from(created), used: Array.from(used) };
}
function skipGenerics(text) {
  const start = /^\s*</.exec(text);
  if (!start) {
    return 0;
  }
  let depth = 0;
  for (let i = start[0].length - 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "<") {
      depth++;
    } else if (ch === ">") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    } else if (!/[\w$\s,?.&]/.test(ch)) {
      return 0;
    }
  }
  return 0;
}
function declarationFrom(lines, line, maxLines = 8) {
  let text = "";
  for (let i = line; i < lines.length && i < line + maxLines; i++) {
    text += (i === line ? "" : "\n") + lines[i];
    if (lines[i].includes(";")) {
      break;
    }
  }
  return text;
}
function unambiguousClassNames(classLabels) {
  const seen = /* @__PURE__ */ new Set();
  const repeated = /* @__PURE__ */ new Set();
  for (const label of classLabels) {
    if (seen.has(label)) {
      repeated.add(label);
    } else {
      seen.add(label);
    }
  }
  return new Set(Array.from(seen).filter((name) => !repeated.has(name)));
}

// src/analysis/source_analyzer.ts
var fileContentCache = /* @__PURE__ */ new Map();
function clearFileContentCache() {
  fileContentCache.clear();
  fileLinesCache.clear();
}
var fileLinesCache = /* @__PURE__ */ new Map();
function getFileLines(fileUri) {
  if (fileLinesCache.has(fileUri)) {
    return fileLinesCache.get(fileUri);
  }
  let lines = null;
  try {
    let content = fileContentCache.get(fileUri);
    if (content === void 0) {
      content = fs6.readFileSync(vscode10.Uri.parse(fileUri).fsPath, "utf8");
      fileContentCache.set(fileUri, content);
    }
    lines = content.split(/\r?\n/);
  } catch {
    lines = null;
  }
  fileLinesCache.set(fileUri, lines);
  return lines;
}
function getDeclarationForSymbol(symbol) {
  const range = symbol.range || symbol.selectionRange;
  if (!range || !symbol.fileUri) {
    return "";
  }
  try {
    let content = fileContentCache.get(symbol.fileUri);
    if (content === void 0) {
      content = fs6.readFileSync(vscode10.Uri.parse(symbol.fileUri).fsPath, "utf8");
      fileContentCache.set(symbol.fileUri, content);
    }
    return declarationFrom(content.split(/\r?\n/), range.start.line);
  } catch {
    return "";
  }
}
function getSourceCodeForSymbol(symbol) {
  const rangeToUse = symbol.range || symbol.selectionRange;
  if (!rangeToUse || !symbol.fileUri) {
    return "";
  }
  try {
    const filePath = vscode10.Uri.parse(symbol.fileUri).fsPath;
    let fileContent = fileContentCache.get(symbol.fileUri);
    if (fileContent === void 0) {
      log.debug(`[Cache MISS] Reading file: ${symbol.fileUri}`);
      fileContent = fs6.readFileSync(filePath, "utf8");
      fileContentCache.set(symbol.fileUri, fileContent);
    } else {
      log.debug(`[Cache HIT] ${symbol.fileUri}`);
    }
    const lines = fileContent.split(/\r?\n/);
    const start = rangeToUse.start;
    const end = rangeToUse.end;
    if (start.line >= lines.length || end.line >= lines.length) {
      return "";
    }
    if (start.line === end.line) {
      return lines[start.line].substring(start.character, end.character);
    }
    let text = lines[start.line].substring(start.character);
    for (let i = start.line + 1; i < end.line; i++) {
      text += "\n" + lines[i];
    }
    text += "\n" + lines[end.line].substring(0, end.character);
    return text;
  } catch {
    return "";
  }
}

// src/analysis/access_classifier.ts
var ASSIGNMENT = /^(\?\?=|~\/=|>>>=|<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=(?![=>]))/;
var NON_CALL_WORDS = /* @__PURE__ */ new Set(["if", "while", "for", "switch", "catch", "assert", "return", "await", "in", "when"]);
var THIS_PREFIX = /\bthis\s*\.\s*$/;
function enclosingGroup(line, position) {
  let depth = 0;
  for (let i = position - 1; i >= 0; i--) {
    const ch = line[i];
    if (ch === ")") {
      depth++;
    } else if (ch === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const before = line.slice(0, i).replace(/\s+$/, "");
      const match = before.match(/[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*(?:<[^()]*>)?$/);
      if (!match) {
        return { open: true, callee: null };
      }
      const name = match[0].replace(/<.*$/, "").replace(/\s+/g, "");
      return { open: true, callee: NON_CALL_WORDS.has(name) ? null : name };
    }
  }
  return { open: false, callee: null };
}
function isConstructorName(callee, names) {
  if (!callee) {
    return false;
  }
  return names.indexOf(callee) >= 0 || names.indexOf(callee.split(".")[0]) >= 0;
}
function classifyAccess(line, start, end, context = {}) {
  const before = line.slice(0, start);
  const after = line.slice(end);
  const names = context.constructorNames || [];
  if (names.length && THIS_PREFIX.test(before)) {
    const head = before.replace(THIS_PREFIX, "");
    const group = enclosingGroup(line, start);
    const sameLineHeader = group.open && isConstructorName(group.callee, names) && /^\s*[,)}\]]/.test(after);
    const ownLineParameter = !group.open && /^\s*(?:(?:required|covariant|final|const)\s+)*(?:[\w$<>?,]+\s+)?$/.test(head) && /^\s*(?:=\s*[^,;)]+)?\s*[,)}\]]?\s*$/.test(after) && !/;\s*$/.test(after);
    if (sameLineHeader || ownLineParameter) {
      return ["write"];
    }
  }
  const next = after.replace(/^[!\s]+/, "");
  const assignment = ASSIGNMENT.exec(next);
  if (assignment) {
    return assignment[0] === "=" ? ["write"] : ["read", "write"];
  }
  if (/^(\+\+|--)/.test(next) || /(\+\+|--)\s*$/.test(before)) {
    return ["read", "write"];
  }
  const previous = before.replace(THIS_PREFIX, "").replace(/\s+$/, "");
  const following = after.replace(/^\s+/, "");
  const isNamedArgument = /[A-Za-z_$][\w$]*\s*:$/.test(previous) && !/\?[^:]*:$/.test(previous);
  const startsArgument = /[(,]$/.test(previous) || isNamedArgument;
  if (startsArgument && /^[,)]/.test(following) && enclosingGroup(line, start).callee !== null) {
    return ["pass"];
  }
  return ["read"];
}

// src/filesystem/path_utils.ts
var import_path2 = __toESM(require("path"));
function canonical(p) {
  const resolved = import_path2.default.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function isSamePath(a, b) {
  return canonical(a) === canonical(b);
}
function isPathInside(child, parent) {
  const c = canonical(child);
  const p = canonical(parent);
  return c === p || c.startsWith(p.endsWith(import_path2.default.sep) ? p : p + import_path2.default.sep);
}

// src/lsp/reference_analysis.ts
var vscode11 = __toESM(require("vscode"));

// src/analysis/hierarchy.ts
function parentNames2(symbol) {
  const relations = symbol.relations;
  if (!relations) {
    return [];
  }
  return [...relations.extends ?? [], ...relations.implements ?? [], ...relations.with ?? []].map((r) => (typeof r === "string" ? r : r.name).split("<")[0].trim()).filter((n) => n !== "");
}
var OverrideIndex = class {
  ownerOfMember = /* @__PURE__ */ new Map();
  subclassesOf = /* @__PURE__ */ new Map();
  constructor(classes) {
    for (const cls of classes) {
      for (const child of cls.children ?? []) {
        this.ownerOfMember.set(child, cls);
      }
      for (const parent of parentNames2(cls)) {
        const list = this.subclassesOf.get(parent);
        if (list) {
          list.push(cls);
        } else {
          this.subclassesOf.set(parent, [cls]);
        }
      }
    }
  }
  /** Members with the same name and kind in every class that comes, directly or not, from the member's class. */
  overridersOf(member) {
    const owner = this.ownerOfMember.get(member);
    if (!owner) {
      return [];
    }
    const found = [];
    const seen = /* @__PURE__ */ new Set([owner]);
    const queue = [owner];
    while (queue.length) {
      const current = queue.shift();
      for (const sub of this.subclassesOf.get(current.name) ?? []) {
        if (seen.has(sub)) {
          continue;
        }
        seen.add(sub);
        queue.push(sub);
        for (const child of sub.children ?? []) {
          if (child.name === member.name && child.kind === member.kind) {
            found.push(child);
          }
        }
      }
    }
    return found;
  }
};

// src/lsp/reference_analysis.ts
var nodesByFileCache = null;
function getNodesByFile(nodes) {
  if (nodesByFileCache) {
    return nodesByFileCache;
  }
  nodesByFileCache = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const uri = node.data.fileUri;
    if (!nodesByFileCache.has(uri)) {
      nodesByFileCache.set(uri, []);
    }
    nodesByFileCache.get(uri).push(node);
  }
  log.debug(`[RefAnalysis] nodesByFile index built: ${nodesByFileCache.size} files`);
  return nodesByFileCache;
}
function clearNodesByFileCache() {
  nodesByFileCache = null;
  referencesCache.clear();
  emptyAnswerStreak = 0;
  log.debug(`[RefAnalysis] nodesByFile + references cache cleared.`);
}
var referencesCache = /* @__PURE__ */ new Map();
var navigationIndex = null;
var uriParseCache = /* @__PURE__ */ new Map();
var overrides = null;
var onPassProgress = null;
function setPassProgress(fn) {
  onPassProgress = fn;
}
function setNavigationIndex(index) {
  navigationIndex = index;
  uriParseCache.clear();
  if (!index) {
    overrides = null;
  }
}
function setNavigationHierarchy(classes) {
  overrides = navigationIndex ? new OverrideIndex(classes) : null;
}
function usagesOf(symbol) {
  const at = (s) => s.selectionRange && s.fileUri ? navigationIndex.referencesTo(vscode11.Uri.parse(s.fileUri).fsPath, s.selectionRange.start.line, s.selectionRange.start.character) : [];
  const usages = [...at(symbol)];
  for (const other of overrides?.overridersOf(symbol) ?? []) {
    usages.push(...at(other));
  }
  if (symbol.kind === vscode11.SymbolKind.Class) {
    for (const child of symbol.children ?? []) {
      if (child.kind === vscode11.SymbolKind.Constructor) {
        usages.push(...at(child));
      }
    }
  }
  return usages;
}
function locationsFromIndex(symbol) {
  const usages = usagesOf(symbol);
  if (usages.length === 0) {
    return null;
  }
  return usages.map((u) => {
    let uri = uriParseCache.get(u.uri);
    if (!uri) {
      uri = vscode11.Uri.parse(u.uri);
      uriParseCache.set(u.uri, uri);
    }
    return new vscode11.Location(uri, new vscode11.Range(u.line, u.character, u.endLine, u.endCharacter));
  });
}
var EMPTY_ANSWER_RETRY_DELAYS_MS = [250, 750, 1500];
var MAX_EMPTY_STREAK = 8;
var emptyAnswerStreak = 0;
async function getReferencesForSymbol(symbol) {
  if (navigationIndex) {
    return locationsFromIndex(symbol);
  }
  const { line, character } = symbol.selectionRange.start;
  const cacheKey = `${symbol.fileUri}:${line}:${character}`;
  if (referencesCache.has(cacheKey)) {
    const cached = referencesCache.get(cacheKey);
    log.debug(`[RefCache HIT] '${symbol.name}' -> ${cached?.length ?? 0} refs`);
    return cached;
  }
  try {
    const ask = async () => await vscode11.commands.executeCommand(
      "vscode.executeReferenceProvider",
      vscode11.Uri.parse(symbol.fileUri),
      symbol.selectionRange.start
    );
    const hasReferences = (r) => !!r && r.length > 0;
    const delays = emptyAnswerStreak >= MAX_EMPTY_STREAK ? [] : EMPTY_ANSWER_RETRY_DELAYS_MS;
    const outcome = await retryUntil(ask, hasReferences, delays);
    emptyAnswerStreak = outcome.exhausted ? emptyAnswerStreak + 1 : 0;
    if (outcome.attempts > 1) {
      log.debug(`[LSP] '${symbol.name}' needed ${outcome.attempts} attempts${outcome.exhausted ? " and still returned nothing" : ""}`);
    }
    const references = outcome.result;
    const result = hasReferences(references) ? references : null;
    referencesCache.set(cacheKey, result);
    log.debug(`[LSP] \u2705 Found ${result?.length ?? 0} references for '${symbol.name}' [cached]`);
    return result;
  } catch (err) {
    referencesCache.set(cacheKey, null);
    log.error(`[GraphBuilder] \u26A0\uFE0F LSP error for '${symbol.name}'`);
    return null;
  }
}
async function tryAddReadsFromEdge(projectGraph, sourceNode, targetNode, targetSymbol, sourceCodeText, createEdge) {
  const cleanedSource = stripCommentsAndStrings(sourceCodeText);
  if (!cleanedSource.includes(targetSymbol.name)) {
    log.debug(`[LSP] Skipping '${targetSymbol.name}' \u2014 not found in source of '${sourceNode.label}'`);
    return;
  }
  const references = await getReferencesForSymbol(targetSymbol);
  if (!references) {
    log.debug(`[LSP]  No references found for '${targetSymbol.name}'`);
    return;
  }
  const nodesByFile = getNodesByFile(projectGraph.nodes);
  for (const ref of references) {
    const container = findEnclosingFunctionOrMethodNode(nodesByFile, {
      uri: ref.uri.toString(),
      range: ref.range
    });
    if (container) {
      log.debug(`[LSP] Reference found within function: ${container.label}`);
    }
    if (container && container.id === sourceNode.id) {
      log.debug(`[LSP] \u{1F3AF} READS_FROM: '${sourceNode.label}' -> '${targetNode.label}'`);
      createEdge(sourceNode.id, targetNode.id, "READS_FROM");
      return;
    }
  }
  log.debug(`[LSP] \u{1F9ED} No reference found within container '${sourceNode.label}'`);
}
var FIELD_KINDS = /* @__PURE__ */ new Set(["field", "property", "variable", "constant"]);
var ACCESS_LABEL = {
  read: "READS_FROM",
  write: "WRITES_TO",
  pass: "PASSES_AS_ARGUMENT"
};
var REFERENCE_CONCURRENCY = 6;
async function addFieldAccessEdges(projectGraph, symbolMapById, usedIdentifiers, projectRoot, createEdge) {
  const nodesById = new Map(projectGraph.nodes.map((n) => [n.id, n]));
  const nodesByFile = getNodesByFile(projectGraph.nodes);
  const candidates = projectGraph.nodes.filter((n) => {
    const symbol = symbolMapById.get(n.id);
    if (!FIELD_KINDS.has(n.kind) || !symbol || !symbol.selectionRange || !symbol.fileUri) {
      return false;
    }
    if (!usedIdentifiers.has(symbol.name)) {
      return false;
    }
    return !projectRoot || isPathInside(vscode11.Uri.parse(n.data.fileUri).fsPath, projectRoot);
  });
  log.debug(`[FieldAccess] ${candidates.length} fields to check of ${projectGraph.nodes.filter((n) => FIELD_KINDS.has(n.kind)).length}`);
  const found = await mapLimited(candidates, REFERENCE_CONCURRENCY, async (field) => {
    const symbol = symbolMapById.get(field.id);
    const references = await getReferencesForSymbol(symbol);
    const kindsByContainer = /* @__PURE__ */ new Map();
    for (const ref of references ?? []) {
      if (ref.range.start.line !== ref.range.end.line) {
        continue;
      }
      const container = findEnclosingCodeNode(nodesByFile, ref.uri.toString(), ref.range.start.line);
      if (!container || container.id === field.id) {
        continue;
      }
      const lines = getFileLines(ref.uri.toString());
      const text = lines?.[ref.range.start.line];
      if (text === void 0) {
        continue;
      }
      const owner = container.parent ? nodesById.get(container.parent) : void 0;
      const constructorNames = container.kind === "constructor" ? [container.label, owner?.label].filter((n) => !!n) : void 0;
      const kinds = classifyAccess(text, ref.range.start.character, ref.range.end.character, { constructorNames });
      const set = kindsByContainer.get(container.id) ?? /* @__PURE__ */ new Set();
      kinds.forEach((k) => set.add(k));
      kindsByContainer.set(container.id, set);
    }
    return kindsByContainer;
  }, (done, total) => onPassProgress?.("fields", done, total));
  let created = 0;
  candidates.forEach((field, i) => {
    found[i].forEach((kinds, containerId) => {
      ["read", "write", "pass"].forEach((kind) => {
        if (kinds.has(kind)) {
          createEdge(containerId, field.id, ACCESS_LABEL[kind]);
          created++;
        }
      });
    });
  });
  log.debug(`[FieldAccess] ${created} field access edges created`);
}
async function addAmbiguousCallEdges(projectGraph, symbolMapById, candidates, createEdge) {
  const idBySymbol = /* @__PURE__ */ new Map();
  symbolMapById.forEach((symbol, id) => idBySymbol.set(symbol, id));
  const nodesByFile = getNodesByFile(projectGraph.nodes);
  const list = Array.from(candidates).filter((s) => s.selectionRange && s.fileUri && idBySymbol.has(s));
  log.debug(`[CallResolution] ${list.length} methods share their name with another one; asking the language server`);
  const callers = await mapLimited(list, REFERENCE_CONCURRENCY, async (symbol) => {
    const targetId = idBySymbol.get(symbol);
    const found = /* @__PURE__ */ new Set();
    for (const ref of await getReferencesForSymbol(symbol) ?? []) {
      if (ref.range.start.line !== ref.range.end.line) {
        continue;
      }
      const container = findEnclosingCodeNode(nodesByFile, ref.uri.toString(), ref.range.start.line);
      if (!container || container.id === targetId) {
        continue;
      }
      const text = getFileLines(ref.uri.toString())?.[ref.range.start.line];
      if (text !== void 0 && /^\s*(?:<[^()]*>)?\s*\(/.test(text.slice(ref.range.end.character))) {
        found.add(container.id);
      }
    }
    return found;
  }, (done, total) => onPassProgress?.("calls", done, total));
  let created = 0;
  list.forEach((symbol, i) => {
    callers[i].forEach((callerId) => {
      createEdge(callerId, idBySymbol.get(symbol), "CALLS");
      created++;
    });
  });
  log.debug(`[CallResolution] ${created} call edges created from ${list.length} ambiguous methods`);
}
function findEnclosingCodeNode(nodesByFile, uri, line) {
  return (nodesByFile.get(uri) ?? []).find((n) => {
    const range = n.data.range;
    return (n.kind === "method" || n.kind === "function" || n.kind === "constructor") && range !== void 0 && range.start.line <= line && range.end.line >= line;
  });
}
function findEnclosingFunctionOrMethodNode(nodesByFile, ref) {
  const nodesInFile = nodesByFile.get(ref.uri) ?? [];
  const pos = ref.range.start;
  return nodesInFile.find((n) => {
    const range = n.data.range;
    return (n.kind === "method" || n.kind === "function") && range !== void 0 && range.start.line <= pos.line && range.end.line >= pos.line;
  });
}

// src/analysis/signature.ts
function methodBody(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        const rest = source.slice(i + 1);
        return /^\s*;/.test(rest) ? "" : rest;
      }
    } else if (depth === 0 && (ch === "{" || ch === "=" && source[i + 1] === ">")) {
      return source.slice(i);
    } else if (depth === 0 && ch === ";") {
      return "";
    }
  }
  return "";
}

// src/analysis/complexity.ts
function cyclomaticComplexity(source) {
  const keywords = source.match(/\b(?:if|for|while|case|catch)\b/g)?.length ?? 0;
  const logical = source.match(/&&|\|\|/g)?.length ?? 0;
  const coalesce = source.match(/\?\?/g)?.length ?? 0;
  const ternary = source.match(/\s\?(?![?.\[])/g)?.length ?? 0;
  return 1 + keywords + logical + coalesce + ternary;
}

// src/analysis/observers.ts
var OBSERVER_PATTERNS = [
  // Widgets that rebuild or react: the first type argument is the holder.
  /\b(?:BlocBuilder|BlocListener|BlocConsumer|BlocSelector|Consumer|Selector|ValueListenableBuilder)\s*<\s*([A-Z]\w*)/g,
  // context.read<T>() / context.watch<T>() / context.select<T, R>()
  /\bcontext\s*\.\s*(?:read|watch|select)\s*<\s*([A-Z]\w*)/g,
  // BlocProvider.of<T>(context), Provider.of<T>(context), RepositoryProvider.of<T>(context)
  /\b(?:BlocProvider|RepositoryProvider|Provider)\s*\.\s*of\s*<\s*([A-Z]\w*)/g,
  // GetX
  /\bGet\s*\.\s*(?:find|put|lazyPut)\s*<\s*([A-Z]\w*)/g
];
function observedTypeNames(source) {
  const found = /* @__PURE__ */ new Set();
  for (const pattern of OBSERVER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return Array.from(found);
}

// src/analysis/called_names.ts
var IDENTIFIER_CALL = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?(?=\s*\()/g;
var PLAIN_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/;
var CalledNames = class {
  plain = /* @__PURE__ */ new Set();
  /** Names that are not plain identifiers (an operator, for example) still need their own pattern. */
  odd = /* @__PURE__ */ new Map();
  constructor(names) {
    for (const name of names) {
      if (PLAIN_NAME.test(name)) {
        this.plain.add(name);
      } else {
        this.odd.set(name, new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`));
      }
    }
  }
  mentioned(code) {
    const found = /* @__PURE__ */ new Set();
    for (const match of code.matchAll(IDENTIFIER_CALL)) {
      const text = match[0];
      if (this.plain.has(text)) {
        found.add(text);
      }
      const dot = text.indexOf(".");
      if (dot >= 0) {
        const last = text.slice(dot + 1);
        if (this.plain.has(last)) {
          found.add(last);
        }
      }
    }
    for (const [name, pattern] of this.odd) {
      if (pattern.test(code)) {
        found.add(name);
      }
    }
    return Array.from(found);
  }
};

// src/analysis/riverpod.ts
function providerDeclarations(text, classNames) {
  const found = /* @__PURE__ */ new Map();
  if (!/Provider|iverpod/.test(text)) {
    return found;
  }
  const declaration = /(?:^|[;}\n])\s*(?:final|const|var)\s+(?:[\w<>?, ]+\s+)?([a-z_]\w*)\s*=\s*(?:\w+\.)?(\w*Provider\w*)\b(?:\s*\.\s*\w+)*\s*(<[^;(]*>)?\s*\(/g;
  for (const match of text.matchAll(declaration)) {
    const open = match.index + match[0].length - 1;
    const end = matchingParenthesis(text, open);
    const body = text.slice(match.index + match[0].indexOf(match[2]) + match[2].length, end + 1);
    found.set(match[1], classesIn(body, classNames));
  }
  for (const match of text.matchAll(/@[Rr]iverpod\b(?:\s*\([^)]*\))?\s*(?:(?:abstract|final)\s+)*(class\s+([A-Z]\w*)|([\w<>?, ]+?)\s+([a-z_]\w*)\s*\()/g)) {
    if (match[2]) {
      found.set(lowerFirst(match[2]) + "Provider", classNames.has(match[2]) ? [match[2]] : []);
    } else {
      found.set(match[4] + "Provider", classesIn(match[3], classNames));
    }
  }
  return found;
}
function watchedProviders(code) {
  const names = /* @__PURE__ */ new Set();
  for (const match of code.matchAll(/\b(?:ref|widgetRef|container)\s*\.\s*(?:watch|read|listen|listenManual|refresh|invalidate|exists)\s*\(\s*([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  return Array.from(names);
}
function classesIn(code, classNames) {
  const usage = typeUsage(code, classNames);
  const tearOffs = Array.from(code.matchAll(/(?<![\w$.])([A-Z][\w$]*)\s*\.\s*new\b/g)).map((m) => m[1]).filter((n) => classNames.has(n));
  return Array.from(/* @__PURE__ */ new Set([...usage.used, ...usage.created, ...tearOffs]));
}
function matchingParenthesis(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return text.length - 1;
}
function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// src/graph/edge_creator.ts
var fs7 = __toESM(require("fs"));
var vscode12 = __toESM(require("vscode"));
async function createGraphEdgesFromSymbols(projectGraph, symbolMapById, createEdge, projectRoot, generatedNodeIds, cachedPackages) {
  log.debug(`[GraphBuilder] Creating edges...`);
  setNavigationHierarchy(Array.from(symbolMapById.values()).filter((s) => s.kind === vscode12.SymbolKind.Class));
  const classNodeIndex = /* @__PURE__ */ new Map();
  for (const node of projectGraph.nodes) {
    if (node.kind === "class" && !classNodeIndex.has(node.label)) {
      classNodeIndex.set(node.label, node);
    }
  }
  const nodeById = new Map(projectGraph.nodes.map((n) => [n.id, n]));
  const classNames = unambiguousClassNames(projectGraph.nodes.filter((n) => n.kind === "class").map((n) => n.label));
  const addTypeEdges = (sourceNode, cleanedSource) => {
    const owner = sourceNode.parent ? nodeById.get(sourceNode.parent) : void 0;
    const usage = typeUsage(cleanedSource, classNames, owner?.label);
    for (const name of usage.created) {
      createEdge(sourceNode.id, classNodeIndex.get(name).id, "INSTANCE_OF");
    }
    for (const name of usage.used) {
      createEdge(sourceNode.id, classNodeIndex.get(name).id, "USES_AS_TYPE");
    }
  };
  const providers = /* @__PURE__ */ new Map();
  const scanned = /* @__PURE__ */ new Set();
  for (const enriched of symbolMapById.values()) {
    const uri = enriched.fileUri;
    if (!uri || !uri.startsWith("file:") || scanned.has(uri)) {
      continue;
    }
    scanned.add(uri);
    try {
      const text = fs7.readFileSync(vscode12.Uri.parse(uri).fsPath, "utf8");
      if (!/Provider|iverpod/.test(text)) {
        continue;
      }
      providerDeclarations(stripCommentsAndStrings(text), classNames).forEach((held, name) => providers.set(name, held));
    } catch {
    }
  }
  const symbolNameIndex = /* @__PURE__ */ new Map();
  for (const enriched of symbolMapById.values()) {
    const name = enriched.name;
    if (!symbolNameIndex.has(name)) {
      symbolNameIndex.set(name, []);
    }
    symbolNameIndex.get(name).push(enriched);
  }
  const nodeBySymbol = /* @__PURE__ */ new Map();
  for (const node of projectGraph.nodes) {
    const sym = symbolMapById.get(node.id);
    if (sym) {
      nodeBySymbol.set(sym, node);
    }
  }
  const calledNames = new CalledNames(symbolNameIndex.keys());
  log.debug(`[EdgeCreator] Indexed ${symbolNameIndex.size} symbol names.`);
  const usedIdentifiers = /* @__PURE__ */ new Set();
  const ambiguousCallTargets = /* @__PURE__ */ new Set();
  for (const sourceNode of projectGraph.nodes) {
    const sourceSymbol = symbolMapById.get(sourceNode.id);
    if (!sourceSymbol) {
      continue;
    }
    if (sourceSymbol.relations) {
      sourceSymbol.relations.extends?.forEach((ext) => {
        const parentName = typeof ext === "string" ? ext : ext.name;
        const baseName = parentName.split("<")[0].trim();
        const targetNode = classNodeIndex.get(baseName);
        if (targetNode) {
          createEdge(sourceNode.id, targetNode.id, "EXTENDS");
        }
      });
      sourceSymbol.relations.with?.forEach((mixin) => {
        const mixinName = typeof mixin === "string" ? mixin : mixin.name;
        const targetNode = classNodeIndex.get(mixinName.split("<")[0].trim());
        if (targetNode) {
          createEdge(sourceNode.id, targetNode.id, "IMPLEMENTS");
        }
      });
      sourceSymbol.relations.implements?.forEach((impl) => {
        const interfaceName = typeof impl === "string" ? impl : impl.name;
        const baseName = interfaceName.split("<")[0].trim();
        const targetNode = classNodeIndex.get(baseName);
        if (targetNode) {
          createEdge(sourceNode.id, targetNode.id, "IMPLEMENTS");
        }
      });
    }
    if (sourceNode.kind === "field" || sourceNode.kind === "property") {
      const declaration = getDeclarationForSymbol(sourceSymbol);
      if (declaration) {
        addTypeEdges(sourceNode, stripCommentsAndStrings(declaration));
      }
      continue;
    }
    if (sourceNode.kind === "method" || sourceNode.kind === "function" || sourceNode.kind === "constructor") {
      const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
      if (!sourceCodeText) {
        continue;
      }
      const cleanedSource = stripCommentsAndStrings(sourceCodeText);
      addTypeEdges(sourceNode, cleanedSource);
      for (const word of cleanedSource.matchAll(/[A-Za-z_$][\w$]*/g)) {
        usedIdentifiers.add(word[0]);
      }
      const body = methodBody(cleanedSource);
      sourceNode.data.complexity = cyclomaticComplexity(body);
      for (const holder of observedTypeNames(body)) {
        const holderNode = classNodeIndex.get(holder);
        if (holderNode && holderNode.id !== sourceNode.id) {
          createEdge(sourceNode.id, holderNode.id, "OBSERVES");
        }
      }
      for (const providerName of watchedProviders(body)) {
        for (const held of providers.get(providerName) ?? []) {
          const heldNode = classNodeIndex.get(held);
          if (heldNode && heldNode.id !== sourceNode.id) {
            createEdge(sourceNode.id, heldNode.id, "OBSERVES");
          }
        }
      }
      const mentionedNames = calledNames.mentioned(body).filter((name) => symbolNameIndex.has(name));
      for (const targetName of mentionedNames) {
        const targetSymbols = symbolNameIndex.get(targetName);
        const callableTargets = targetSymbols.filter((s) => {
          const n = nodeBySymbol.get(s);
          return n && (n.kind === "method" || n.kind === "function");
        });
        for (const targetSymbol of targetSymbols) {
          const targetNode = nodeBySymbol.get(targetSymbol);
          if (!targetNode || sourceNode.id === targetNode.id) {
            continue;
          }
          if (targetNode.kind === "method" || targetNode.kind === "function") {
            if (callableTargets.length === 1) {
              createEdge(sourceNode.id, targetNode.id, "CALLS");
            } else {
              ambiguousCallTargets.add(targetSymbol);
            }
          } else {
            await tryAddReadsFromEdge(
              projectGraph,
              sourceNode,
              targetNode,
              targetSymbol,
              sourceCodeText,
              createEdge
            );
          }
        }
      }
    }
  }
  await addAmbiguousCallEdges(projectGraph, symbolMapById, ambiguousCallTargets, createEdge);
  await addFieldAccessEdges(projectGraph, symbolMapById, usedIdentifiers, projectRoot, createEdge);
}

// src/packages/package_discovery.ts
var import_path4 = __toESM(require("path"));
var vscode13 = __toESM(require("vscode"));
var fs9 = __toESM(require("fs"));

// src/packages/package_analyzer.ts
var fs8 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
function analyzeExternalPackage(packageName, packagePath, rawData, projectRootPath2) {
  log.debug(` -> Analyzing details of package '${packageName}'...`);
  if (!fs8.existsSync(packagePath)) {
    log.debug(`    -> ERROR: Package path does not exist: ${packagePath}`);
    return null;
  }
  try {
    const packageInfo = {
      name: packageName,
      path: packagePath,
      version: rawData.version || "unknown",
      type: determinePackageType(packageName, packagePath, projectRootPath2),
      dartFiles: [],
      hasLibFolder: false,
      isFlutterPackage: false,
      description: ""
    };
    log.debug(`    -> Classified as: '${packageInfo.type}'`);
    const libPath = import_path3.default.join(packagePath, "lib");
    packageInfo.hasLibFolder = fs8.existsSync(libPath);
    const packagePubspecPath = import_path3.default.join(packagePath, "pubspec.yaml");
    if (fs8.existsSync(packagePubspecPath)) {
      try {
        const pubspecContent = fs8.readFileSync(packagePubspecPath, "utf8");
        packageInfo.isFlutterPackage = pubspecContent.includes("sdk: flutter");
        const descMatch = pubspecContent.match(/description:\s*(.+)/);
        if (descMatch) {
          packageInfo.description = descMatch[1].trim().replace(/['"]/g, "");
        }
      } catch (e) {
        log.debug(`    -> INFO: Could not read pubspec.yaml for package ${packageName}.`);
      }
    }
    if (packageInfo.hasLibFolder) {
      packageInfo.dartFiles = findDartFilesInPackage(libPath);
      log.debug(`    -> Found ${packageInfo.dartFiles.length} .dart files in its 'lib' folder.`);
    }
    return packageInfo;
  } catch (error) {
    log.error(`\u274C CRITICAL ERROR analyzing package ${packageName}:`);
    if (error instanceof Error) {
      log.error(`   Mensaje: ${error.message}`);
    } else {
      log.error(`   Unknown error: ${String(error)}`);
    }
    return null;
  }
}
function determinePackageType(packageName, packagePath, projectRootPath2) {
  let actualProjectRoot = projectRootPath2 || null;
  if (!actualProjectRoot) {
    actualProjectRoot = findProjectRootWithPubspec(packagePath) || findProjectRootWithPubspec(process.cwd());
  }
  if (actualProjectRoot && isPathInside(packagePath, actualProjectRoot)) {
    return "custom";
  }
  if (actualProjectRoot) {
    try {
      const mainPubspecPath = import_path3.default.join(actualProjectRoot, "pubspec.yaml");
      if (fs8.existsSync(mainPubspecPath)) {
        const pubspecContent = fs8.readFileSync(mainPubspecPath, "utf8");
        const pathDependencyRegex = new RegExp(`${packageName}:\\s*\\n\\s*path:\\s*`, "m");
        if (pathDependencyRegex.test(pubspecContent)) {
          return "custom";
        }
        const devDependencyRegex = new RegExp(`dev_dependencies:[\\s\\S]*?${packageName}:\\s*`, "m");
        if (devDependencyRegex.test(pubspecContent)) {
          return "custom";
        }
      }
    } catch (error) {
      log.error(`[Debug] Error leyendo pubspec.yaml principal: ${error}`);
    }
  }
  const flutterOfficialPackages = [
    "flutter",
    "flutter_test",
    "flutter_web_plugins",
    "flutter_driver",
    "integration_test",
    "flutter_localizations",
    "material",
    "cupertino"
  ];
  if (flutterOfficialPackages.includes(packageName) || packageName.startsWith("flutter_")) {
    return "flutter_official";
  }
  if (packagePath.includes("dart-sdk") || packagePath.includes("flutter/bin/cache/dart-sdk")) {
    return "sdk";
  }
  return "third_party";
}

// src/packages/package_discovery.ts
function findAllPackages(searchStartPath) {
  log.debug(`
--- [Debug] Starting findAllPackages ---`);
  const allPackages = [];
  const projectRoot = findProjectRootWithPubspec(searchStartPath);
  if (!projectRoot) {
    log.debug("\u26A0\uFE0F [Debug] Project root with pubspec.yaml not found. Ending search.");
    return allPackages;
  }
  log.debug(`[Debug] Project root found at: ${projectRoot}`);
  const packageConfigPath = import_path4.default.join(projectRoot, ".dart_tool", "package_config.json");
  if (!fs9.existsSync(packageConfigPath)) {
    log.debug(`\u26A0\uFE0F [Debug].dart_tool/package_config.json file not found. Cannot determine packages.`);
    return allPackages;
  }
  log.debug(`[Debug] Analyzing ${packageConfigPath}...`);
  try {
    const packageConfig = JSON.parse(fs9.readFileSync(packageConfigPath, "utf8"));
    if (packageConfig.packages && Array.isArray(packageConfig.packages)) {
      log.debug(`   -> Found ${packageConfig.packages.length} packages in file.`);
      for (const pkg of packageConfig.packages) {
        if (!pkg.name || !pkg.rootUri) {
          log.debug(`   -> Skipping package without name or rootUri: ${JSON.stringify(pkg)}`);
          continue;
        }
        log.debug(`
   --- Processing package:  ${pkg.name} ---`);
        log.debug(`   original URI: ${pkg.rootUri}`);
        let packagePath;
        if (pkg.rootUri.startsWith("file://")) {
          packagePath = vscode13.Uri.parse(pkg.rootUri).fsPath;
        } else {
          const dartToolDir = import_path4.default.dirname(packageConfigPath);
          packagePath = import_path4.default.resolve(dartToolDir, pkg.rootUri);
        }
        log.debug(` Resolved Path: ${packagePath}`);
        const packageInfo = analyzeExternalPackage(pkg.name, packagePath, pkg, projectRoot);
        if (packageInfo) {
          allPackages.push(packageInfo);
          log.debug(`   -> Package added: ${packageInfo.name} (Type: ${packageInfo.type})`);
        }
      }
    }
  } catch (error) {
    log.error(`\u274C [Debug]CRITICAL ERROR reading package_config.json`);
    if (error instanceof Error) {
      log.error(`   Mensaje: ${error.message}`);
    } else {
      log.error(`   Unknown error: ${String(error)}`);
    }
  }
  log.info(`
[Debug] \u2705 Search completed. Found ${allPackages.length} packages total (external and local)`);
  log.info(`--- [Debug] End of findAllPackages ---
`);
  return allPackages;
}

// src/packages/graph_integration/container_nodes.ts
var vscode14 = __toESM(require("vscode"));
function packagesNeedingContainers(packages, projectRootPath2) {
  if (!projectRootPath2) {
    return packages;
  }
  return packages.filter((pkg) => !isSamePath(pkg.path, projectRootPath2));
}
function createPackageContainerNodes(externalPackages, projectGraph, generatedNodeIds) {
  log.debug(`[PackageContainers] Creating container nodes for${externalPackages.length} paquetes...`);
  for (const pkg of externalPackages) {
    const containerNodeId = `package_container:${pkg.name}`;
    if (!generatedNodeIds.has(containerNodeId)) {
      generatedNodeIds.add(containerNodeId);
      const fakeRange = new vscode14.Range(
        new vscode14.Position(0, 0),
        new vscode14.Position(0, pkg.name.length)
      );
      const containerNode = {
        id: containerNodeId,
        label: pkg.name,
        kind: "package_container",
        data: {
          fileUri: `file:///packages/${pkg.name}`,
          range: fakeRange,
          selectionRange: fakeRange,
          access: "public",
          isSDK: pkg.type === "sdk",
          layer: "utility",
          source: {
            type: "external_package",
            packageName: pkg.name,
            packageVersion: pkg.version,
            packageType: pkg.type
          },
          packageName: pkg.name,
          packageVersion: pkg.version,
          packageType: pkg.type
        },
        parent: void 0,
        inDegree: 0,
        outDegree: 0
      };
      projectGraph.nodes.push(containerNode);
      log.debug(` \u2705 Container created: ${pkg.name} (${pkg.type})`);
    }
  }
  log.debug(`[PackageContainers] \u2705 ${projectGraph.nodes.filter((n) => n.kind === "package_container").length} package containers created`);
}

// src/packages/graph_integration/dependency_edges.ts
function createInterPackageDependencyEdges(projectGraph, externalPackages, createEdge) {
  log.debug(`[InterPackageDeps] Analyzing dependencies between packages...`);
  const nodeMap = /* @__PURE__ */ new Map();
  for (const node of projectGraph.nodes) {
    nodeMap.set(node.id, node);
  }
  const packageContainerMap = /* @__PURE__ */ new Map();
  for (const pkg of externalPackages) {
    packageContainerMap.set(pkg.name, `package_container:${pkg.name}`);
  }
  let interPackageEdges = 0;
  for (const edge of projectGraph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }
    const sourcePackage = sourceNode.data.source?.packageName;
    const targetPackage = targetNode.data.source?.packageName;
    if (sourcePackage && targetPackage && sourcePackage !== targetPackage) {
      const sourceContainerId = packageContainerMap.get(sourcePackage);
      const targetContainerId = packageContainerMap.get(targetPackage);
      if (sourceContainerId && targetContainerId) {
        createEdge(sourceContainerId, targetContainerId, "USES_AS_TYPE");
        interPackageEdges++;
        log.debug(`   Dependency: ${sourcePackage} -> ${targetPackage}`);
      }
    }
    if (!sourcePackage && targetPackage) {
      const targetContainerId = packageContainerMap.get(targetPackage);
      if (targetContainerId) {
        createEdge("project_root", targetContainerId, "USES_AS_TYPE");
      }
    }
  }
  log.debug(`  \u2705 ${interPackageEdges} inter-package dependencies created`);
}

// src/packages/source_detector.ts
var import_path5 = __toESM(require("path"));
var vscode15 = __toESM(require("vscode"));
function determineFileSource(fileUri, allPackages) {
  try {
    if (!fileUri) {
      return { type: "project" };
    }
    const filePath = vscode15.Uri.parse(fileUri).fsPath;
    const posixFilePath = filePath.replace(/\\/g, "/");
    if (posixFilePath.includes("dart-sdk/lib") || posixFilePath.includes("flutter/bin/cache/dart-sdk")) {
      return { type: "sdk", packageType: "sdk" };
    }
    for (const pkg of allPackages) {
      if (isPathInside(filePath, pkg.path)) {
        return {
          type: pkg.type === "custom" ? "project" : "external_package",
          packageName: pkg.name,
          packageVersion: pkg.version,
          packageType: pkg.type,
          relativePath: import_path5.default.relative(pkg.path, filePath)
        };
      }
    }
    return { type: "project" };
  } catch (error) {
    log.error(`\u274C ERROR in determineFileSource when processing URI: "${fileUri}"`);
    if (error instanceof Error) {
      log.error(`   -> Message:${error.message}`);
    }
    return { type: "project" };
  }
}

// src/packages/graph_integration/node_assignment.ts
function assignNodesToPackageContainers(projectGraph, externalPackages) {
  log.debug(`[PackageAssignment] Assigning nodes to package containers...`);
  let assignedCount = 0;
  let projectNodesCount = 0;
  for (const node of projectGraph.nodes) {
    if (node.kind === "package_container") {
      continue;
    }
    const fileSource = determineFileSource(node.data.fileUri, externalPackages);
    node.data.source = fileSource;
    if (fileSource.type === "external_package" && fileSource.packageName) {
      const containerNodeId = `package_container:${fileSource.packageName}`;
      node.parent = containerNodeId;
      assignedCount++;
      node.label = `\u{1F517} ${node.label}`;
      log.debug(`    \u{1F4E6} ${node.label} -> ${fileSource.packageName}`);
    } else if (fileSource.type === "sdk") {
      node.label = `\u2699\uFE0F ${node.label}`;
    } else if (fileSource.type === "project") {
      projectNodesCount++;
    }
  }
  log.debug(`  \u2705 Assignment completed:`);
  log.debug(`    \u2022 Project nodes: ${projectNodesCount}`);
  log.debug(`    \u2022 External package nodes: ${assignedCount}`);
}

// src/packages/graph_integration/integration.ts
async function integrateExternalPackages(projectGraph, projectRoot, generatedNodeIds, createEdge, cachedPackages) {
  log.debug(`[ExternalPackages] \u{1F50D} Integrating external packages..`);
  const externalPackages = cachedPackages ?? findAllPackages(projectRoot);
  if (externalPackages.length === 0) {
    log.debug(`[ExternalPackages] No relevant external packages found`);
    return;
  }
  createPackageContainerNodes(
    packagesNeedingContainers(externalPackages, findProjectRootWithPubspec(projectRoot)),
    projectGraph,
    generatedNodeIds
  );
  assignNodesToPackageContainers(projectGraph, externalPackages);
  createInterPackageDependencyEdges(projectGraph, externalPackages, createEdge);
  log.debug(`[ExternalPackages] \u2705 External package integration completed`);
}

// src/graph/graph_builder.ts
var import_path6 = __toESM(require("path"));
async function buildGraphModel(enrichedFiles, projectRoot) {
  clearFileContentCache();
  clearNodesByFileCache();
  const projectGraph = { nodes: [], edges: [] };
  const generatedNodeIds = /* @__PURE__ */ new Set();
  const symbolMapById = /* @__PURE__ */ new Map();
  let edgeIdCounter = 0;
  const edgeCounts = {};
  const edgeSet = /* @__PURE__ */ new Set();
  const createEdge = (sourceId, targetId, label) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }
    if (!generatedNodeIds.has(sourceId) || !generatedNodeIds.has(targetId)) {
      return;
    }
    const edgeKey = `${sourceId}|${targetId}|${label}`;
    if (edgeSet.has(edgeKey)) {
      return;
    }
    edgeSet.add(edgeKey);
    projectGraph.edges.push({ id: `e${edgeIdCounter++}`, source: sourceId, target: targetId, label });
    if (label) {
      edgeCounts[label] = (edgeCounts[label] || 0) + 1;
    }
  };
  log.debug(`[GraphBuilder] Creating nodes...`);
  createGraphNodesFromSymbols(enrichedFiles, projectGraph, symbolMapById, generateGlobalSymbolId, generatedNodeIds);
  log.debug(`  -> ${projectGraph.nodes.length} nodes created.`);
  log.debug(`[GraphBuilder] Calling findAllPackages once...`);
  const allPackages = projectRoot ? findAllPackages(projectRoot) : [];
  log.debug(`[GraphBuilder] Found ${allPackages.length} packages`);
  if (projectRoot) {
    log.debug(`[GraphBuilder] Extracting symbols from external packages...`);
    const externalSymbols = await extractSymbolsFromExternalPackages(projectRoot, allPackages);
    for (const [id, symbol] of externalSymbols) {
      symbolMapById.set(id, symbol);
    }
    if (externalSymbols.size > 0) {
      createGraphNodesFromSymbols(
        [{ fileUri: "external_packages", symbols: Array.from(externalSymbols.values()) }],
        projectGraph,
        symbolMapById,
        generateGlobalSymbolId,
        generatedNodeIds
      );
      log.debug(`-> ${externalSymbols.size} external symbols added`);
    }
  }
  await createGraphEdgesFromSymbols(
    projectGraph,
    symbolMapById,
    createEdge,
    projectRoot,
    generatedNodeIds,
    allPackages
  );
  log.debug(`[GraphBuilder] Edge breakdown: ${JSON.stringify(edgeCounts)}`);
  log.debug(`  -> Final total edges: ${projectGraph.edges.length}`);
  if (projectRoot && allPackages.length > 0) {
    log.debug(`[GraphBuilder] \u{1F4E6} Integrating external packages...`);
    const nodesBefore = projectGraph.nodes.length;
    await integrateExternalPackages(
      projectGraph,
      projectRoot,
      generatedNodeIds,
      createEdge,
      allPackages
    );
    const packageContainers = projectGraph.nodes.filter((n) => n.kind === "package_container");
    log.debug(`[GraphBuilder] \u2705 Nodes before: ${nodesBefore}, after: ${projectGraph.nodes.length}`);
    log.debug(`    \u2022 Package containers: ${packageContainers.map((p) => p.label).join(", ")}`);
  }
  clearFileContentCache();
  clearNodesByFileCache();
  return projectGraph;
}
function getRelevantExternalPackages(packages) {
  return packages.filter(
    (pkg) => pkg.type === "third_party" || pkg.type === "custom" || pkg.type === "flutter_official" && !["flutter", "flutter_test"].includes(pkg.name)
  );
}
async function extractSymbolsFromExternalPackages(projectRoot, allPackages) {
  const externalSymbols = /* @__PURE__ */ new Map();
  const relevantPackages = getRelevantExternalPackages(allPackages);
  for (const pkg of relevantPackages) {
    if (!pkg.hasLibFolder || pkg.dartFiles.length === 0) {
      continue;
    }
    const mainFiles = pkg.dartFiles.filter((file) => {
      const fileName = import_path6.default.basename(file, ".dart");
      return fileName === pkg.name || fileName === "main" || file.endsWith(`lib/${pkg.name}.dart`);
    }).slice(0, 1);
    for (const dartFile of mainFiles) {
      try {
        const fileUri = vscode16.Uri.file(dartFile);
        const symbols = await vscode16.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          fileUri
        );
      } catch (error) {
        log.debug(`Skipping external file: ${dartFile}`);
      }
    }
  }
  return externalSymbols;
}

// src/utils/caches.ts
var resolvedTypesCache = /* @__PURE__ */ new Map();

// src/analysis/symbol_processor.ts
var vscode21 = __toESM(require("vscode"));

// src/analysis/enrichment/basic_enrichment.ts
var vscode17 = __toESM(require("vscode"));
function enrichWithBasicInfo(enrichedSym, logPrefix, currentFileUri, dependencies) {
  log.debug(`${logPrefix}  [Basic Info] Enriching  '${enrichedSym.name}'...`);
  enrichedSym.fileUri = enrichedSym.fileUri || currentFileUri;
  enrichedSym.isSDK = !!enrichedSym.fileUri?.includes("/dart-sdk/lib/");
  enrichedSym.access = enrichedSym.name.startsWith("_") ? "private" : "public";
  log.debug(`${logPrefix}    \u21B3 Final fileUri: ${enrichedSym.fileUri}`);
  log.debug(`${logPrefix}    \u21B3 Access: ${enrichedSym.access}, Is SDK: ${enrichedSym.isSDK}`);
  if (enrichedSym.parentId) {
    log.debug(`${logPrefix}   \u21B3 parentId: ${enrichedSym.parentId}`);
  }
  if (enrichedSym.kind === vscode17.SymbolKind.Class) {
    const classKey = `${enrichedSym.fileUri}#${enrichedSym.name.split("<")[0].trim()}`;
    log.debug(`${logPrefix}    \u21B3 It's a class. Searching relationships with key:  "${classKey}"`);
    const relations = dependencies.projectClassRelations.get(classKey);
    if (relations) {
      const logMessage = [
        `Extends: ${relations.extends?.join(", ") || "none"}`,
        `Implements: ${relations.implements?.join(", ") || "none"}`,
        `With: ${relations.with?.join(", ") || "none"}`
      ].join("; ");
      log.debug(`${logPrefix}    \u21B3 \u2705 SUCCESS: Inheritance relationships found. ${logMessage}`);
      if (!enrichedSym.relations) {
        enrichedSym.relations = {};
      }
      enrichedSym.relations.extends = relations.extends;
      enrichedSym.relations.implements = relations.implements;
      enrichedSym.relations.with = relations.with;
    } else {
      log.debug(`${logPrefix} \u21B3 INFO: No pre-calculated inheritance relationships found for this class.`);
    }
  }
}

// src/analysis/enrichment/detail_enrichment.ts
var vscode19 = __toESM(require("vscode"));

// src/analysis/enrichment/type-resolver.ts
var vscode18 = __toESM(require("vscode"));
var _typeIndex = null;
function buildTypeIndex(allProjectFilesData) {
  _typeIndex = /* @__PURE__ */ new Map();
  for (const file of allProjectFilesData) {
    for (const symbol of file.symbols) {
      if (symbol.kind === vscode18.SymbolKind.Class || symbol.kind === vscode18.SymbolKind.Enum || symbol.kind === 22) {
        if (!_typeIndex.has(symbol.name)) {
          _typeIndex.set(symbol.name, symbol);
        }
      }
    }
  }
  log.debug(`[TypeIndex] Built index with ${_typeIndex.size} types.`);
}
function clearTypeIndex() {
  _typeIndex = null;
  log.debug(`[TypeIndex] Index cleared.`);
}
async function resolveTypeByName(typeName, dependencies) {
  const baseTypeName = parseBaseTypeName(typeName);
  if (!baseTypeName) {
    return void 0;
  }
  if (resolvedTypesCache.has(typeName)) {
    log.debug(` [Cache HIT] ${typeName}`);
    return resolvedTypesCache.get(typeName);
  }
  let foundSymbol;
  if (_typeIndex) {
    foundSymbol = _typeIndex.get(baseTypeName);
    log.debug(`\u{1F5C2}\uFE0F [Index ${foundSymbol ? "HIT" : "MISS"}] ${baseTypeName}`);
  } else {
    log.debug(`\u26A0\uFE0F [TypeIndex] Index not built, falling back to linear search for '${baseTypeName}'`);
    for (const file of dependencies.allProjectFilesData) {
      for (const symbol of file.symbols) {
        if ((symbol.kind === vscode18.SymbolKind.Class || symbol.kind === vscode18.SymbolKind.Enum || symbol.kind === 22) && symbol.name === baseTypeName) {
          foundSymbol = symbol;
          break;
        }
      }
      if (foundSymbol) {
        break;
      }
    }
  }
  if (foundSymbol) {
    const result = {
      name: typeName,
      definition: {
        name: foundSymbol.name,
        kind: foundSymbol.kind,
        fileUri: foundSymbol.fileUri,
        selectionRange: foundSymbol.selectionRange,
        isSDK: !!foundSymbol.isSDK
      }
    };
    resolvedTypesCache.set(typeName, result);
    log.debug(`\u{1F4E6} [Cache SET] ${typeName}`);
    return result;
  }
  const fallbackResult = { name: typeName };
  resolvedTypesCache.set(typeName, fallbackResult);
  return fallbackResult;
}

// src/analysis/enrichment/detail_enrichment.ts
async function enrichWithTypesFromDetail(enrichedSym, logPrefix, dependencies) {
  const symbol = enrichedSym;
  if (!symbol.detail || typeof symbol.detail !== "string") {
    return;
  }
  log.debug(`[DEBUG-ENRICH-DETAIL] Enriching ${symbol.name}, detail: ${symbol.detail}`);
  log.debug(`${logPrefix}  [DEBUG] symbol.kind: ${symbol.kind}, symbol.detail: ${symbol.detail}`);
  log.debug(`${logPrefix}  [Type Detail] Analyzing detail: "${symbol.detail}"`);
  if ((symbol.kind === vscode19.SymbolKind.Field || symbol.kind === vscode19.SymbolKind.Property) && !enrichedSym.resolvedType) {
    const fieldTypeMatch = symbol.detail.match(
      /^\s*(?:(?:@[\w.]+\s*)*(?:late|final|const|static|required|covariant)\s+)*([\w<>\[\]\{\},?().\s]+?)\s+[\w$]+\s*(?:=.*)?$/
    );
    if (fieldTypeMatch?.[1]) {
      enrichedSym.resolvedType = fieldTypeMatch[1].trim();
      log.debug(`${logPrefix}  \u21B3 Detail: Campo '${symbol.name}' tipo extra\xEDdo: ${enrichedSym.resolvedType}`);
      enrichedSym.resolvedTypeRef = await resolveTypeByName(enrichedSym.resolvedType, dependencies);
    }
  } else if (/\(.*\)/s.test(symbol.detail)) {
    log.debug(`${logPrefix}  [DEBUG] Evaluating enrichedSym.parameters, current value: ${JSON.stringify(enrichedSym.parameters)}`);
    if (!Array.isArray(enrichedSym.parameters) || enrichedSym.parameters.length === 0) {
      log.debug(`${logPrefix}  [DEBUG] enrichedSym.parameters is undefined or empty. Starting parsing.`);
      enrichedSym.parameters = [];
      const paramsContentRegex = /\((.*)\)/s;
      const paramsMatch = symbol.detail.match(paramsContentRegex);
      if (!paramsMatch || typeof paramsMatch[1] !== "string") {
        log.debug(`${logPrefix}   \u26A0\uFE0F Could not extract content between parentheses from detail: "${symbol.detail}"`);
      }
      if (paramsMatch && typeof paramsMatch[1] === "string") {
        log.debug(`${logPrefix}    \u{1F4CC} paramsMatch: ${paramsMatch?.[1]}`);
        let fullParamsString = paramsMatch[1].trim();
        log.debug(`${logPrefix}    \u{1F4CC} fullParamsString: "${fullParamsString}"`);
        if (fullParamsString !== "") {
          let parseIndividualParamList2 = function(paramSubString, areNamed, areOptionalPositional) {
            let remaining = paramSubString.trim();
            const parsedParams = [];
            if (remaining === "") {
              return parsedParams;
            }
            const singleParamRegex = /^\s*(?:(required|covariant)\s+)?((?:[\w$.<>?\[\]\s(),']+?|Function\s*\((?:[^)]*\))?\s*\??))\s+([\w$]+)\s*(?:=.*?)?(?:,|$)/;
            const thisFieldWithOptionalRequiredRegex = /^\s*(required\s+)?this\.([\w$]+)\s*(?:=.*?)?(?:,|$)/;
            const functionTypeParamRegex = /^\s*(?:(required|covariant)\s+)?((?:[\w$<>?,.\s\[\]]+\s+)?Function\s*\((?:[^)]*?\))?\s*\??)\s+([\w$]+)\s*(?:=.*?)?(?:,|$)/;
            const typeOrNameOnlyRegex = /^\s*((?:[\w$]+(?:<[\w$,\s<>?]+(?:<[\w$,\s<>?]+>)?\??>)?\??)|(?:(?:[\w$<>?,.\s\[\]]+\s+)?Function\s*\((?:[^)]*?\))?\s*\??)|(?:[\w$.]+))\s*(?:,|$)/;
            while (remaining.length > 0) {
              let parsedThisIteration = false;
              let pMatch;
              pMatch = remaining.match(thisFieldWithOptionalRequiredRegex);
              if (pMatch && pMatch[2]) {
                const isRequiredForThis = !!pMatch[1];
                const fieldName = pMatch[2].trim();
                parsedParams.push({
                  name: fieldName,
                  type: `self_field:${fieldName}`,
                  isNamed: areNamed,
                  isRequired: areNamed && isRequiredForThis,
                  isOptionalPositional: false
                });
                parsedThisIteration = true;
              } else {
                pMatch = remaining.match(functionTypeParamRegex);
                if (pMatch && pMatch[2] && pMatch[3]) {
                  parsedParams.push({
                    type: pMatch[2].trim().replace(/\s+/g, " "),
                    name: pMatch[3].trim(),
                    isNamed: areNamed,
                    isRequired: areNamed && !!pMatch[1] && pMatch[1] === "required",
                    isOptionalPositional: areOptionalPositional
                  });
                  parsedThisIteration = true;
                } else {
                  pMatch = remaining.match(singleParamRegex);
                  if (pMatch && pMatch[2] && pMatch[3]) {
                    parsedParams.push({
                      type: pMatch[2].trim().replace(/\s+/g, " "),
                      name: pMatch[3].trim(),
                      isNamed: areNamed,
                      isRequired: areNamed && !!pMatch[1] && pMatch[1] === "required",
                      isOptionalPositional: areOptionalPositional
                    });
                    parsedThisIteration = true;
                  }
                }
              }
              if (parsedThisIteration && pMatch) {
                let consumedLength = pMatch[0].length;
                if (!pMatch[0].endsWith(",") && remaining.length > consumedLength && remaining[consumedLength] === ",") {
                  consumedLength++;
                }
                remaining = remaining.substring(consumedLength).trim();
              } else {
                pMatch = remaining.match(typeOrNameOnlyRegex);
                if (pMatch && pMatch[1]) {
                  const potentialTypeOrName = pMatch[1].trim().replace(/\s+/g, " ");
                  let paramToAdd;
                  if (areNamed || areOptionalPositional || potentialTypeOrName.match(/[<>?()]|Function|^void$|^dynamic$|^Never$|^Null$|^Object$|^bool$|^int$|^double$|^num$|^String$/i)) {
                    paramToAdd = { type: potentialTypeOrName, name: void 0, isNamed: areNamed, isOptionalPositional: areOptionalPositional, isRequired: areNamed && remaining.startsWith("required ") };
                  } else {
                    paramToAdd = { type: "dynamic", name: potentialTypeOrName, isNamed: areNamed, isOptionalPositional: areOptionalPositional, isRequired: areNamed && remaining.startsWith("required ") };
                  }
                  parsedParams.push(paramToAdd);
                  let consumedLength = pMatch[0].length;
                  if (!pMatch[0].endsWith(",") && remaining.length > consumedLength && remaining[consumedLength] === ",") {
                    consumedLength++;
                  }
                  remaining = remaining.substring(consumedLength).trim();
                } else {
                  if (remaining.trim().length > 0) {
                    log.debug(`${logPrefix}  Could not continue parsing parameters for ${symbol.name}. Remaining: '${remaining}'`);
                  }
                  break;
                }
              }
            }
            log.debug(`${logPrefix}    \u{1F4CC} Parsed ${parsedParams.length} parameters from block${areNamed ? "named" : areOptionalPositional ? "optional" : "required"}: ${JSON.stringify(parsedParams, null, 2)}`);
            return parsedParams;
          };
          var parseIndividualParamList = parseIndividualParamList2;
          let requiredParamsStr = fullParamsString;
          let optionalPositionalStr = "";
          let namedParamsStr = "";
          const namedStartIndex = fullParamsString.indexOf("{");
          const namedEndIndex = fullParamsString.lastIndexOf("}");
          if (namedStartIndex !== -1 && namedEndIndex > namedStartIndex) {
            const partBeforeNamed = fullParamsString.substring(0, namedStartIndex);
            if (!partBeforeNamed.substring(partBeforeNamed.lastIndexOf("[") > partBeforeNamed.lastIndexOf("{") ? partBeforeNamed.lastIndexOf("[") : 0).includes("}")) {
              namedParamsStr = fullParamsString.substring(namedStartIndex + 1, namedEndIndex).trim();
              requiredParamsStr = partBeforeNamed.trim();
            }
          }
          const optionalStartIndex = requiredParamsStr.indexOf("[");
          const optionalEndIndex = requiredParamsStr.lastIndexOf("]");
          if (optionalStartIndex !== -1 && optionalEndIndex > optionalStartIndex) {
            if (!requiredParamsStr.substring(optionalStartIndex).includes("{")) {
              optionalPositionalStr = requiredParamsStr.substring(optionalStartIndex + 1, optionalEndIndex).trim();
              requiredParamsStr = requiredParamsStr.substring(0, optionalStartIndex).trim();
            }
          }
          if (requiredParamsStr.endsWith(",")) {
            requiredParamsStr = requiredParamsStr.substring(0, requiredParamsStr.length - 1).trim();
          }
          if (requiredParamsStr) {
            const parsedRequired = parseIndividualParamList2(requiredParamsStr, false, false);
            log.debug(`${logPrefix}    \u{1F4CC} requiredParamsStr -> ${requiredParamsStr}`);
            log.debug(`${logPrefix}    \u{1F4CC} parsedRequired -> ${JSON.stringify(parsedRequired)}`);
            enrichedSym.parameters.push(...parsedRequired);
          }
          if (optionalPositionalStr) {
            const optionalRequired = parseIndividualParamList2(optionalPositionalStr, false, true);
            log.debug(`${logPrefix}    \u{1F4CC} optionalPositionalStr -> ${optionalPositionalStr}`);
            log.debug(`${logPrefix}    \u{1F4CC} optionalRequired -> ${JSON.stringify(optionalRequired)}`);
            enrichedSym.parameters.push(...optionalRequired);
          }
          if (namedParamsStr) {
            const namedRequired = parseIndividualParamList2(namedParamsStr, true, false);
            log.debug(`${logPrefix}    \u{1F4CC} namedParamsStr -> ${namedParamsStr}`);
            log.debug(`${logPrefix}    \u{1F4CC} namedRequired -> ${JSON.stringify(namedRequired)}`);
            enrichedSym.parameters.push(...namedRequired);
          }
          log.debug(`${logPrefix}  [DEBUG] enrichedSym.parameters now has: ${JSON.stringify(enrichedSym.parameters)}`);
          if (enrichedSym.parameters.length === 0) {
            log.debug(`${logPrefix}    \u26A0\uFE0F enrichedSym.parameters is still empty after parsing`);
          }
        }
      }
    }
    if (enrichedSym.parameters && enrichedSym.parameters.length > 0) {
      for (const param of enrichedSym.parameters) {
        if (!param.type.startsWith("self_field:")) {
          param.typeRef = await resolveTypeByName(param.type, dependencies);
        } else {
          param.typeRef = { name: param.type };
        }
      }
      log.debug(`${logPrefix}  \u21B3 Detail: Resolved types for ${enrichedSym.parameters.length} parameters in '${symbol.name}'.`);
    }
    if (symbol.kind !== vscode19.SymbolKind.Constructor && !enrichedSym.returnType) {
      const normalizedDetail = symbol.detail.replace(/@[\w.]+\s*/g, "").replace(/\b(static|external|async|sync|factory|late|final|const|required)\b\s*/g, "").trim();
      const escapedName = symbol.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const returnTypeRegex = new RegExp(
        `^([\\w<>{}\\[\\]\\s.,?()]+?)\\s+${escapedName}\\s*\\(`
      );
      const match = normalizedDetail.match(returnTypeRegex);
      if (match?.[1]) {
        const returnType = match[1].trim();
        if (returnType.toLowerCase() !== "void") {
          enrichedSym.returnType = returnType;
          log.debug(`${logPrefix}  \u21B3 Detail: Method '${symbol.name}' extracted return type: ${returnType}`);
          enrichedSym.returnTypeRef = await resolveTypeByName(returnType, dependencies);
        }
      } else {
        log.debug(`${logPrefix}  \u26A0\uFE0F Could not extract return type for '${symbol.name}'`);
      }
    }
  }
  if (symbol.kind === vscode19.SymbolKind.Constructor && enrichedSym.parameters?.length === 0 && /^\s*\(\s*\{\s*this\.[\w$]+/.test(symbol.detail)) {
    const fallbackThisRegex = /this\.([\w$]+)/g;
    const fallbackParams = [];
    let match;
    while ((match = fallbackThisRegex.exec(symbol.detail)) !== null) {
      const fieldName = match[1];
      fallbackParams.push({
        name: fieldName,
        type: `self_field:${fieldName}`,
        isNamed: true,
        isRequired: false,
        isOptionalPositional: false
      });
    }
    if (fallbackParams.length > 0) {
      enrichedSym.parameters = fallbackParams;
      log.debug(`${logPrefix}  \u21B3 Fallback: Inferred ${fallbackParams.length} this.field parameters for '${symbol.name}'.`);
    }
  }
  if (!Array.isArray(enrichedSym.parameters)) {
    enrichedSym.parameters = [];
    log.debug(`${logPrefix}    \u26A0\uFE0F Forced enrichedSym.parameters = [] because it remained undefined.`);
  }
  log.debug(`[DEBUG-ENRICH-DETAIL] Generated params: ${JSON.stringify(enrichedSym.parameters, null, 2)}`);
}

// src/analysis/enrichment/regex_enrichment.ts
function enrichWithSourceRegexTypes(enrichedSym, logPrefix, dependencies) {
  const { fileContent } = dependencies;
  const needsType = (enrichedSym.kind === KIND_FIELD || enrichedSym.kind === KIND_PROPERTY) && !enrichedSym.resolvedType;
  const needsReturn = (enrichedSym.kind === KIND_METHOD || enrichedSym.kind === KIND_FUNCTION) && !enrichedSym.returnType;
  if (!needsType && !needsReturn || !enrichedSym.selectionRange) {
    return;
  }
  log.debug(`${logPrefix}DEBUG_F: Starting regex fallback for '${enrichedSym.name}'`);
  const lines = dependencies.fileLines ??= fileContent.split("\n");
  const startLine = Math.max(0, enrichedSym.selectionRange.start.line - 5);
  const endLine = Math.min(lines.length, enrichedSym.selectionRange.start.line + 1);
  const codeSnippet = lines.slice(startLine, endLine).join("\n");
  log.debug(`${logPrefix}  DEBUG_F: Evaluating snippet:
${codeSnippet}`);
  const escapedSymName = escapeRegExp(enrichedSym.name);
  let match = null;
  if (needsType) {
    const fieldRegex = new RegExp(
      `(?:@\\w+(\\([^)]*\\))?\\s*)*(?:\\w+\\s+)*(.+?)\\s+${escapedSymName}\\s*(?:;|=)`
    );
    match = codeSnippet.match(fieldRegex);
    if (match?.[2]) {
      enrichedSym.resolvedType = match[2].replace(/@\w+(\([^)]*\))?/g, "").trim();
      log.debug(`${logPrefix}  \u21B3 Regex SUCCESS (Field): Field '${enrichedSym.name}' has type: ${enrichedSym.resolvedType}`);
    }
  } else if (needsReturn) {
    const methodRegex = new RegExp(
      `(?:@\\w+(\\([^)]*\\))?\\s*)*(?:static\\s+)?(?:\\w+\\s+)*(.+?)\\s+(?:get\\s+)?${escapedSymName}\\s*\\(`
    );
    match = codeSnippet.match(methodRegex);
    if (match?.[2]) {
      const potentialReturn = match[2].replace(/@\w+(\([^)]*\))?/g, "").trim();
      if (potentialReturn.toLowerCase() !== "void") {
        enrichedSym.returnType = potentialReturn;
        log.debug(`${logPrefix}  \u21B3 Regex SUCCESS (Method): Method '${enrichedSym.name}' returns: ${enrichedSym.returnType}`);
      } else {
        enrichedSym.hoverChecked = true;
      }
    }
  }
  if (!match) {
    log.debug(`${logPrefix}  DEBUG_F: Regex found no match for '${enrichedSym.name}'`);
  }
}

// src/lsp/hover_enrichment.ts
var vscode20 = __toESM(require("vscode"));
var hoverCache = /* @__PURE__ */ new Map();
function clearHoverCache() {
  hoverCache.clear();
  log.debug(`[HoverCache] Cache cleared.`);
}
async function enrichWithHoverTypes(enrichedSym, logPrefix, dependencies) {
  const needsTypeInfo = (enrichedSym.kind === vscode20.SymbolKind.Field || enrichedSym.kind === vscode20.SymbolKind.Property) && !enrichedSym.resolvedType || (enrichedSym.kind === vscode20.SymbolKind.Method || enrichedSym.kind === vscode20.SymbolKind.Function) && !enrichedSym.returnType || enrichedSym.kind === vscode20.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0);
  if (!enrichedSym.fileUri || !enrichedSym.selectionRange || !needsTypeInfo) {
    log.debug(`${logPrefix}  \u26A0\uFE0F Skipped enrichHover for '${enrichedSym.name}' (kind: ${enrichedSym.kind}) -> needsTypeInfo: ${needsTypeInfo}`);
    return;
  }
  if (enrichedSym.hoverChecked) {
    return;
  }
  enrichedSym.hoverChecked = true;
  const { line, character } = enrichedSym.selectionRange.start;
  const positionKey = `${enrichedSym.fileUri}:${line}:${character}`;
  let contentString;
  if (hoverCache.has(positionKey)) {
    contentString = hoverCache.get(positionKey);
    log.debug(`${logPrefix}  [HoverCache HIT] ${positionKey}`);
  } else {
    try {
      const hoverResultArray = await vscode20.commands.executeCommand(
        "vscode.executeHoverProvider",
        vscode20.Uri.parse(enrichedSym.fileUri),
        enrichedSym.selectionRange.start
      );
      const hoverResult = hoverResultArray && hoverResultArray.length > 0 ? hoverResultArray[0] : null;
      if (!hoverResult?.contents?.length) {
        hoverCache.set(positionKey, null);
        return;
      }
      contentString = hoverResult.contents.map(
        (content) => typeof content === "string" ? content : content.value
      ).join("\n");
      hoverCache.set(positionKey, contentString);
      log.debug(`${logPrefix}  \u{1F4E6} [HoverCache SET] ${positionKey}`);
    } catch (e) {
      log.error(`${logPrefix}  \u26A0\uFE0F Error in Hover for ${enrichedSym.name}: ${e.message}`);
      hoverCache.set(positionKey, null);
      return;
    }
  }
  if (!contentString) {
    return;
  }
  const escapedSymName = escapeRegExp(enrichedSym.name);
  if ((enrichedSym.kind === vscode20.SymbolKind.Field || enrichedSym.kind === vscode20.SymbolKind.Property) && !enrichedSym.resolvedType) {
    const fieldRegex = new RegExp("```dart\\s*(?:[\\w\\s]+\\s)?(.+?)\\s+" + escapedSymName);
    const match = contentString.match(fieldRegex);
    if (match?.[1]) {
      enrichedSym.resolvedType = match[1].trim();
      log.debug(`${logPrefix}  \u21B3 Hover: Field '${enrichedSym.name}' resolved type: ${enrichedSym.resolvedType}`);
    }
  } else if ((enrichedSym.kind === vscode20.SymbolKind.Method || enrichedSym.kind === vscode20.SymbolKind.Function) && !enrichedSym.returnType) {
    const methodRegex = new RegExp("```dart\\s*(?:static\\s+)?(.+?)\\s+(?:get\\s+)?[\"'`]?" + escapedSymName + "[\"'`]?\\s*\\(");
    const match = contentString.match(methodRegex);
    if (match?.[1]) {
      const returnType = match[1].trim();
      if (returnType.toLowerCase() !== "void") {
        enrichedSym.returnType = returnType;
        log.debug(`${logPrefix}  \u21B3 Hover: Method '${enrichedSym.name}' return type: ${enrichedSym.returnType}`);
      }
    }
  } else if (enrichedSym.kind === vscode20.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0)) {
    log.debug(`${logPrefix}  [DEBUG-CONSTRUCTOR] Constructor found: ${enrichedSym.name}`);
    const paramRegex = /this\.(\w+)/g;
    const matches = [...contentString.matchAll(paramRegex)];
    if (matches.length > 0) {
      enrichedSym.parameters = matches.map((match) => ({
        name: match[1],
        type: `self_field:${match[1]}`
      }));
      log.debug(`${logPrefix}  \u21B3 Hover: Constructor '${enrichedSym.name}' extracted parameters: ${enrichedSym.parameters.map((p) => p.name).join(", ")}`);
    } else {
      log.debug(`${logPrefix}  \u26A0\uFE0F Constructor '${enrichedSym.name}' without extractable parameters via hover`);
    }
  }
}

// src/analysis/symbol_processor.ts
var LSP_CONCURRENCY_LIMIT = 5;
async function withConcurrencyLimit(tasks, limit) {
  const results = [];
  let index = 0;
  async function runNext() {
    if (index >= tasks.length) {
      return;
    }
    const current = index++;
    results[current] = await tasks[current]();
    await runNext();
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, runNext);
  await Promise.all(workers);
  return results;
}
async function processSymbolRecursiveLSP(symbolToProcess, currentFileUri, dependencies, depth = 0, parentEnrichedSymbol) {
  const logPrefix = "  ".repeat(depth);
  if (!symbolToProcess.selectionRange) {
    log.debug(`${logPrefix}\u26A0\uFE0F Symbol '${symbolToProcess.name}' skipped. No selectionRange.`);
    return symbolToProcess;
  }
  log.debug(`${logPrefix}\u{1F50D} Processing: ${symbolToProcess.name} (Kind: ${symbolToProcess.kind})`);
  const enrichedSym = {
    ...symbolToProcess,
    fileUri: symbolToProcess.fileUri ?? currentFileUri
  };
  enrichWithBasicInfo(enrichedSym, logPrefix, currentFileUri, dependencies);
  try {
    await enrichWithTypesFromDetail(enrichedSym, logPrefix, dependencies);
  } catch (e) {
    log.debug(`${logPrefix}\u26A0\uFE0F Error in detail enrich: ${e instanceof Error ? e.message : e}`);
  }
  try {
    enrichWithSourceRegexTypes(enrichedSym, logPrefix, dependencies);
  } catch (e) {
    log.debug(`${logPrefix}\u26A0\uFE0F Error in enrichWithSourceRegexTypes: ${e instanceof Error ? e.message : e}`);
  }
  try {
    if (!enrichedSym.hoverChecked) {
      await enrichWithHoverTypes(enrichedSym, logPrefix, dependencies);
      enrichedSym.hoverChecked = true;
    }
  } catch (e) {
    log.debug(`${logPrefix}\u26A0\uFE0F Error in hover enrich: ${e instanceof Error ? e.message : e}`);
  }
  if (enrichedSym.children && enrichedSym.children.length > 0) {
    const parentForNextRecursion = enrichedSym.kind === vscode21.SymbolKind.Class ? enrichedSym : parentEnrichedSymbol;
    const tasks = enrichedSym.children.map(
      (child) => () => processSymbolRecursiveLSP(
        child,
        enrichedSym.fileUri,
        dependencies,
        depth + 1,
        parentForNextRecursion
      )
    );
    log.debug(`${logPrefix} Processing ${tasks.length} children with concurrency limit ${LSP_CONCURRENCY_LIMIT}`);
    enrichedSym.children = await withConcurrencyLimit(tasks, LSP_CONCURRENCY_LIMIT);
  }
  return enrichedSym;
}

// src/analysis/class_relations.ts
var vscode22 = __toESM(require("vscode"));
var fs10 = __toESM(require("fs"));
var CLAUSE_KEYWORDS = /* @__PURE__ */ new Set(["extends", "with", "implements"]);
function parseInheritanceClauses(header) {
  const result = { extends: [], with: [], implements: [] };
  let depth = 0;
  let current;
  let buffer = "";
  const flush = () => {
    if (!current) {
      buffer = "";
      return;
    }
    let item = "";
    let itemDepth = 0;
    for (const ch of buffer) {
      if (ch === "<") {
        itemDepth++;
      }
      if (ch === ">") {
        itemDepth--;
      }
      if (ch === "," && itemDepth === 0) {
        if (item.trim()) {
          result[current].push(item.trim().replace(/<\s+/g, "<"));
        }
        item = "";
      } else {
        item += ch;
      }
    }
    if (item.trim()) {
      result[current].push(item.trim().replace(/<\s+/g, "<"));
    }
    buffer = "";
  };
  for (const token of header.match(/[A-Za-z_$][\w$]*|[<>,]|[^\sA-Za-z_$<>,]+/g) ?? []) {
    if (token === "<") {
      depth++;
    }
    if (token === ">") {
      depth--;
    }
    if (depth === 0 && CLAUSE_KEYWORDS.has(token)) {
      flush();
      current = token;
      continue;
    }
    buffer += token === "," || token === "<" || token === ">" ? token : ` ${token}`;
  }
  flush();
  return result;
}
function extractClassHeader(content, range) {
  const lines = content.split(/\r?\n/);
  let header = "";
  for (let i = range.start.line; i < lines.length && i < range.start.line + 20; i++) {
    const raw = i === range.start.line ? lines[i].substring(range.start.character) : lines[i];
    const line = raw.replace(/\/\/.*$/, "");
    const brace = line.indexOf("{");
    if (brace >= 0) {
      header += " " + line.substring(0, brace);
      break;
    }
    header += " " + line;
  }
  return header.replace(/\s+/g, " ").trim();
}
function buildClassRelationsFromSymbols(filesData) {
  const relations = /* @__PURE__ */ new Map();
  for (const fileData of filesData) {
    let content;
    const readContent = () => {
      if (content === void 0 && fileData.file) {
        try {
          content = fs10.readFileSync(fileData.file, "utf8");
        } catch {
          content = "";
        }
      }
      return content ?? "";
    };
    const visit = (symbols) => {
      for (const symbol of symbols ?? []) {
        if (symbol.kind === vscode22.SymbolKind.Class) {
          const header = symbol.detail || (symbol.range ? extractClassHeader(readContent(), symbol.range) : "");
          if (header) {
            relations.set(`${fileData.fileUri}#${symbol.name}`, parseInheritanceClauses(header));
          }
        }
        visit(symbol.children);
      }
    };
    visit(fileData.symbols);
  }
  return relations;
}

// src/analysis/imports.ts
var DIRECTIVE = /^\s*(?:import|export)\s+(['"])([^'"]+)\1/;
var MAX_IMPORTS_PER_FILE = 200;
function parseImports(content) {
  const found = [];
  const lines = content.split(/\r?\n/);
  for (let line = 0; line < lines.length && found.length < MAX_IMPORTS_PER_FILE; line++) {
    const text = lines[line];
    if (/^\s*\/\//.test(text)) {
      continue;
    }
    const match = DIRECTIVE.exec(text);
    if (match) {
      found.push({ uri: match[2], line, column: text.indexOf(match[2]) });
    }
  }
  return found;
}
function parsePubspecName(content) {
  const match = /^name:\s*['"]?([\w.-]+)['"]?\s*(?:#.*)?$/m.exec(content);
  return match ? match[1] : "";
}

// src/packages/import_targets.ts
var fs11 = __toESM(require("fs"));
var path12 = __toESM(require("path"));
var import_url = require("url");
function readPackageLibDirs(packageConfigJson, configDir) {
  const result = {};
  let config;
  try {
    config = JSON.parse(packageConfigJson);
  } catch {
    return result;
  }
  for (const pkg of config.packages ?? []) {
    if (!pkg.name || !pkg.rootUri) {
      continue;
    }
    try {
      const root = pkg.rootUri.startsWith("file:") ? (0, import_url.fileURLToPath)(pkg.rootUri) : path12.resolve(configDir, decodeURIComponent(pkg.rootUri));
      result[pkg.name] = path12.resolve(root, pkg.packageUri ?? "lib");
    } catch {
    }
  }
  return result;
}
function findSdkLibDir(candidates, exists = fs11.existsSync) {
  for (const candidate of candidates) {
    const lib = path12.join(candidate, "lib");
    if (exists(path12.join(lib, "core", "core.dart"))) {
      return lib;
    }
  }
  return void 0;
}
function resolveImportFile(uri, libDirs, sdkLibDir, exists = fs11.existsSync) {
  const dart = /^dart:(\w+)$/.exec(uri);
  if (dart) {
    if (!sdkLibDir) {
      return void 0;
    }
    const file = path12.join(sdkLibDir, dart[1], dart[1] + ".dart");
    return exists(file) ? file : void 0;
  }
  const pkg = /^package:([^/]+)\/(.+)$/.exec(uri);
  if (pkg && libDirs[pkg[1]]) {
    const file = path12.join(libDirs[pkg[1]], pkg[2]);
    return exists(file) ? file : void 0;
  }
  return void 0;
}

// src/lsp/dart_sdk.ts
var vscode23 = __toESM(require("vscode"));
var path14 = __toESM(require("path"));
var fs12 = __toESM(require("fs"));
var import_child_process = require("child_process");

// src/lsp/dart_executable.ts
var path13 = __toESM(require("path"));
function realDartExecutable(found, exists, platform = process.platform) {
  const exe = platform === "win32" ? "dart.exe" : "dart";
  const base = path13.basename(found).toLowerCase();
  const isLauncher = /\.(bat|cmd|sh)$/.test(base) || path13.basename(path13.dirname(found)).toLowerCase() === "bin" && base === "dart" && exists(path13.join(path13.dirname(found), "cache", "dart-sdk", "bin", exe));
  if (!isLauncher) {
    return found;
  }
  const fromFlutter = path13.join(path13.dirname(found), "cache", "dart-sdk", "bin", exe);
  return exists(fromFlutter) ? fromFlutter : found;
}
function firstExistingPath(output, exists) {
  return output.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "").find(exists);
}

// src/lsp/dart_sdk.ts
function findDartSdk() {
  const cfg = vscode23.workspace.getConfiguration("satori");
  const userPath = cfg.get("dartSdkPath")?.trim();
  if (userPath) {
    log.debug(`Checking user configured path: ${userPath}`);
    if (fs12.existsSync(userPath) && fs12.statSync(userPath).isDirectory()) {
      const dartExecutable = path14.join(userPath, "bin", "dart");
      if (fs12.existsSync(dartExecutable)) {
        log.info(`\u2705 Found Dart SDK at configured path: ${userPath}`);
        return dartExecutable;
      }
    }
    if (fs12.existsSync(userPath)) {
      log.info(`\u2705 Found Dart executable at configured path: ${userPath}`);
      return userPath;
    }
    log.debug(`Configured Dart SDK path not found: ${userPath}`);
  }
  try {
    const cmd = process.platform === "win32" ? "where dart" : "which dart";
    const dartPath = firstExistingPath((0, import_child_process.execSync)(cmd, { encoding: "utf-8" }).toString(), fs12.existsSync);
    if (dartPath) {
      log.info(`\u2705 Found Dart SDK in system PATH: ${dartPath}`);
      return dartPath;
    }
  } catch (error) {
    log.debug("Dart SDK not found in system PATH");
  }
  log.error("\u274C Dart SDK not found");
  return void 0;
}

// src/analysis/audit_config.ts
var DEFAULT_AUDIT_CONFIG = {
  godWmc: 47,
  godAtfd: 5,
  godTcc: 0.33,
  weights: { coupling: 0.3, size: 0.15, cycles: 0.25, violations: 0.3 }
};
function bounded(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function readAuditConfig(get) {
  const d = DEFAULT_AUDIT_CONFIG;
  return {
    godWmc: bounded(get("audit.godClass.wmc"), d.godWmc, 1, 1e5),
    godAtfd: bounded(get("audit.godClass.atfd"), d.godAtfd, 0, 1e5),
    godTcc: bounded(get("audit.godClass.tcc"), d.godTcc, 0, 1),
    weights: {
      coupling: bounded(get("audit.weights.coupling"), d.weights.coupling, 0, 1),
      size: bounded(get("audit.weights.size"), d.weights.size, 0, 1),
      cycles: bounded(get("audit.weights.cycles"), d.weights.cycles, 0, 1),
      violations: bounded(get("audit.weights.violations"), d.weights.violations, 0, 1)
    }
  };
}

// src/analysis/architecture_file.ts
var fs13 = __toESM(require("fs"));
var path15 = __toESM(require("path"));
var ARCHITECTURE_FILE = "satori.json";
function findArchitectureFile(start) {
  let dir = path15.resolve(start);
  for (let i = 0; i < 6; i++) {
    const candidate = path15.join(dir, ARCHITECTURE_FILE);
    if (fs13.existsSync(candidate)) {
      return candidate;
    }
    if (fs13.existsSync(path15.join(dir, "pubspec.yaml"))) {
      return void 0;
    }
    const parent = path15.dirname(dir);
    if (parent === dir) {
      return void 0;
    }
    dir = parent;
  }
  return void 0;
}
function architectureFileFor(start) {
  const existing = findArchitectureFile(start);
  if (existing) {
    return existing;
  }
  let dir = path15.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (fs13.existsSync(path15.join(dir, "pubspec.yaml"))) {
      return path15.join(dir, ARCHITECTURE_FILE);
    }
    const parent = path15.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path15.join(path15.resolve(start), ARCHITECTURE_FILE);
}
function writeLayerOverride(start, className, layer) {
  const file = architectureFileFor(start);
  const existed = fs13.existsSync(file);
  let json = {};
  if (existed) {
    try {
      json = JSON.parse(fs13.readFileSync(file, "utf8") || "{}");
    } catch (e) {
      return { ok: false, file, created: false, problem: `${ARCHITECTURE_FILE} is not valid JSON (${e.message}), so it was not changed.` };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return { ok: false, file, created: false, problem: `${ARCHITECTURE_FILE} must hold an object, so it was not changed.` };
    }
  }
  if (!json.architecture || typeof json.architecture !== "object") {
    json.architecture = { preset: "default" };
  }
  const overrides2 = json.architecture.overrides && typeof json.architecture.overrides === "object" ? json.architecture.overrides : {};
  if (layer === null) {
    delete overrides2[className];
  } else {
    overrides2[className] = layer;
  }
  if (Object.keys(overrides2).length > 0) {
    json.architecture.overrides = overrides2;
  } else {
    delete json.architecture.overrides;
  }
  fs13.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  return { ok: true, file, created: !existed };
}
function architectureDigest(file) {
  if (!file) {
    return "";
  }
  try {
    const json = JSON.parse(fs13.readFileSync(file, "utf8"));
    if (json && json.architecture && typeof json.architecture === "object") {
      delete json.architecture.overrides;
    }
    return JSON.stringify(json);
  } catch {
    return "unreadable";
  }
}
function discoverFolders(projectDir) {
  const list = (dir) => {
    try {
      return fs13.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
    } catch {
      return [];
    }
  };
  const lib = list(path15.join(projectDir, "lib"));
  if (lib.length === 1 && lib[0] === "src") {
    return { base: "lib/src", folders: list(path15.join(projectDir, "lib", "src")) };
  }
  return { base: "lib", folders: lib };
}
function loadArchitecture(start) {
  const file = findArchitectureFile(start);
  if (!file) {
    return parseResult(void 0);
  }
  try {
    const context = { discoverFolders: () => discoverFolders(path15.dirname(file)) };
    return { ...parseArchitecture(fs13.readFileSync(file, "utf8"), context), file };
  } catch (e) {
    return { ...parseResult(void 0), problems: [`${ARCHITECTURE_FILE} could not be read (${e.message}). The default layers are used.`], file };
  }
}
function parseResult(text) {
  return parseArchitecture(text);
}
function viewArchitecture(a) {
  return {
    layers: a.layers.map((l) => ({ id: l.id, label: l.label, description: l.description, color: l.color, icon: l.icon, neutral: l.neutral === true })),
    mode: a.mode,
    allow: a.allow,
    forbid: a.forbid,
    neutral: a.neutral,
    builtin: a.builtin,
    overrides: a.overrides
  };
}

// src/ui/loading_state.ts
var PHASE_ORDER = ["files", "symbols", "relations", "types", "graph", "draw"];
var WEIGHT = { files: 0.03, symbols: 0.3, relations: 0.3, types: 0.12, graph: 0.2, draw: 0.05 };
var silentReporter = { start: () => void 0, progress: () => void 0, finish: () => void 0 };
var LoadingState = class {
  phases = /* @__PURE__ */ new Map();
  constructor(labels) {
    for (const id of PHASE_ORDER) {
      this.phases.set(id, { id, label: labels[id], status: "pending", done: 0, total: 0, detail: "" });
    }
  }
  start(id, detail = "") {
    const phase = this.phases.get(id);
    if (phase.status === "done") {
      return;
    }
    phase.status = "active";
    phase.detail = detail;
  }
  progress(id, done, total, detail) {
    const phase = this.phases.get(id);
    if (phase.status === "done") {
      return;
    }
    phase.status = "active";
    phase.done = Math.max(0, Math.min(done, total));
    phase.total = Math.max(0, total);
    if (detail !== void 0) {
      phase.detail = detail;
    }
  }
  finish(id) {
    const phase = this.phases.get(id);
    phase.status = "done";
    phase.done = phase.total;
    phase.detail = "";
  }
  snapshot() {
    const phases = PHASE_ORDER.map((id) => ({ ...this.phases.get(id) }));
    let overall = 0;
    for (const phase of phases) {
      const fraction2 = phase.status === "done" ? 1 : phase.status === "active" && phase.total > 0 ? phase.done / phase.total : 0;
      overall += WEIGHT[phase.id] * fraction2;
    }
    return { phases, overall: Math.min(1, overall) };
  }
};
var Throttle = class {
  constructor(send, minGapMs = 150, now = Date.now) {
    this.send = send;
    this.minGapMs = minGapMs;
    this.now = now;
  }
  last = 0;
  timer;
  request() {
    const wait = this.last + this.minGapMs - this.now();
    if (wait <= 0) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), wait);
    }
  }
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
    this.last = this.now();
    this.send();
  }
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
  }
};

// src/ui/webview_creator.ts
var ENRICH_FILE_CONCURRENCY = 4;
function readOwnPackageName(projectRoot) {
  try {
    const root = findProjectRootWithPubspec(projectRoot);
    return root ? parsePubspecName(fs14.readFileSync(import_path7.default.join(root, "pubspec.yaml"), "utf8")) : "";
  } catch {
    return "";
  }
}
function resolveImportTargets(projectRoot, fileImports, ownPackage) {
  const targets = {};
  try {
    const root = findProjectRootWithPubspec(projectRoot);
    if (!root) {
      return targets;
    }
    const configPath = import_path7.default.join(root, ".dart_tool", "package_config.json");
    let libDirs = {};
    const candidates = [];
    if (fs14.existsSync(configPath)) {
      const json = fs14.readFileSync(configPath, "utf8");
      libDirs = readPackageLibDirs(json, import_path7.default.dirname(configPath));
      const flutterRoot = JSON.parse(json).flutterRoot;
      if (flutterRoot) {
        candidates.push(import_path7.default.join(vscode24.Uri.parse(flutterRoot).fsPath, "bin", "cache", "dart-sdk"));
      }
    }
    const dart = findDartSdk();
    if (dart) {
      candidates.push(import_path7.default.dirname(import_path7.default.dirname(dart)), import_path7.default.join(import_path7.default.dirname(dart), "cache", "dart-sdk"));
    }
    const sdkLib = findSdkLibDir(candidates);
    const wanted = /* @__PURE__ */ new Set();
    Object.values(fileImports).forEach((list) => list.forEach((i) => {
      if (i.uri.startsWith("dart:") || i.uri.startsWith("package:") && !i.uri.startsWith(`package:${ownPackage}/`)) {
        wanted.add(i.uri);
      }
    }));
    wanted.forEach((uri) => {
      const file = resolveImportFile(uri, libDirs, sdkLib);
      if (file) {
        targets[uri] = vscode24.Uri.file(file).toString();
      }
    });
  } catch (error) {
    log.debug(`Could not resolve the imports to files: ${error}`);
  }
  return targets;
}
function annotationsKey(projectRoot) {
  return `satori.annotations:${projectRoot}`;
}
function loadAnnotations(memento, projectRoot) {
  return memento.get(annotationsKey(projectRoot), {});
}
function saveAnnotations(memento, projectRoot, data) {
  return memento.update(annotationsKey(projectRoot), data);
}
function findClassFieldSymbol(classSymbol, fieldName) {
  return classSymbol.children?.find(
    (f) => f.name === fieldName && (f.kind === vscode24.SymbolKind.Field || f.kind === vscode24.SymbolKind.Property)
  );
}
async function createWebview(context, data) {
  const startedAt = Date.now();
  const reporter = data.reporter ?? silentReporter;
  function getLanguage() {
    const config = vscode24.workspace.getConfiguration("satori");
    return config.get("language", "en");
  }
  const panel = vscode24.window.createWebviewPanel(
    "astDiagram",
    "AST Diagram",
    vscode24.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode24.Uri.joinPath(context.extensionUri, "media")
      ]
    }
  );
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${panel.webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${panel.webview.cspSource}`,
    `img-src data: ${panel.webview.cspSource}`
  ].join("; ");
  const fileImports = {};
  const loadedArchitecture = loadArchitecture(data.projectRoot);
  if (loadedArchitecture.problems.length > 0) {
    loadedArchitecture.problems.forEach((p) => log.info(`satori.json: ${p}`));
    void vscode24.window.showWarningMessage(`satori.json: ${loadedArchitecture.problems[0]}${loadedArchitecture.problems.length > 1 ? ` (+${loadedArchitecture.problems.length - 1} more, see the "satori" output)` : ""}`);
  }
  let projectGraph;
  let enrichedAt;
  let graphBuiltAt;
  let engine = "saved analysis";
  let relationsWaitMs = 0;
  if (data.cached) {
    projectGraph = data.cached.graph;
    Object.assign(fileImports, data.cached.fileImports);
    enrichedAt = graphBuiltAt = Date.now();
    log.info(`Using the saved analysis: ${projectGraph.nodes.length} nodes, ${projectGraph.edges.length} edges.`);
  } else {
    let validateParentIds2 = function(symbols) {
      if (!symbols) {
        return;
      }
      for (const sym of symbols) {
        if (sym.parentId && !existingUniqueIds.has(sym.parentId)) {
          log.debug(`\u274C Inconsistency detected: parentId '${sym.parentId}' of '${sym.name}' does not exist in the uniqueIds set.`);
        }
        if (sym.children) {
          validateParentIds2(sym.children);
        }
      }
    };
    var validateParentIds = validateParentIds2;
    log.debug("Starting data enrichment for webview..");
    resolvedTypesCache.clear();
    clearHoverCache();
    const projectClassRelations = buildClassRelationsFromSymbols(data.files);
    log.debug(`AST relations detected: ${projectClassRelations.size} classes.`);
    buildTypeIndex(data.files);
    log.debug("[TypeIndex] Type index built \u2014 starting enrichment.");
    const allProjectFilesData = data.files.map((df) => ({
      ...df,
      fileUri: typeof df.fileUri === "string" && df.fileUri.startsWith("file:") ? df.fileUri : vscode24.Uri.file(df.file).toString()
    }));
    if (data.reusedImports) {
      Object.assign(fileImports, data.reusedImports);
    }
    reporter.start("types");
    const processedFiles = await mapLimited(data.files, ENRICH_FILE_CONCURRENCY, async (f_item) => {
      const fileUriString = typeof f_item.fileUri === "string" && f_item.fileUri.startsWith("file:") ? f_item.fileUri : vscode24.Uri.file(f_item.file).toString();
      if (f_item.enriched) {
        return { file: f_item.file, fileUri: fileUriString, symbols: f_item.symbols };
      }
      const fileContent = fs14.readFileSync(f_item.file, "utf8");
      const imports = parseImports(fileContent);
      if (imports.length) {
        fileImports[fileUriString] = imports;
      }
      const enrichmentDeps = {
        projectClassRelations,
        fileContent,
        allProjectFilesData
      };
      const processedSymbols = f_item.symbols ? await Promise.all(f_item.symbols.map(
        (sym) => processSymbolRecursiveLSP(sym, fileUriString, enrichmentDeps, 0, void 0)
      )) : [];
      return { ...f_item, fileUri: fileUriString, symbols: processedSymbols };
    }, (done, total) => reporter.progress("types", done, total));
    reporter.finish("types");
    data.files = processedFiles;
    data.onEnriched?.(processedFiles, fileImports);
    enrichedAt = Date.now();
    log.debug("\u2705 Deep enrichment of all files completed.");
    clearTypeIndex();
    log.debug("\u2705 Type index cleared.");
    log.debug("Phase 2: Building project graph model...");
    reporter.start("graph");
    const waitStarted = Date.now();
    const navigation = data.navigation ? await data.navigation : null;
    relationsWaitMs = Date.now() - waitStarted;
    if (navigation) {
      log.info(`Relationships read from the analysis server: ${navigation.files} files (start ${navigation.startMs}ms, analysis ${navigation.analyzeMs}ms, navigation ${navigation.navigationMs}ms).`);
    }
    engine = navigation ? "analysis server" : "language server";
    setNavigationIndex(navigation ? navigation.index : null);
    setArchitecture(loadedArchitecture.architecture, data.projectRoot);
    setPassProgress((pass, done, total) => reporter.progress("graph", done, total, t(`loading.graph.${pass}`)));
    try {
      projectGraph = await buildGraphModel(data.files, data.projectRoot);
    } finally {
      setNavigationIndex(null);
      setArchitecture(null);
      setPassProgress(null);
    }
    reporter.finish("graph");
    if (!loadedArchitecture.architecture.builtin) {
      const classes = projectGraph.nodes.filter((n) => n.kind === "class");
      const neutral = classes.filter((n) => n.data.layer === loadedArchitecture.architecture.neutral).length;
      log.info(`satori.json: ${classes.length - neutral} of ${classes.length} classes were placed in a layer; ${neutral} are in "${loadedArchitecture.architecture.neutral}".`);
    }
    graphBuiltAt = Date.now();
    log.debug(`Phase 2: Graph model built. Nodes: ${projectGraph.nodes.length}, Edges: ${projectGraph.edges.length}`);
    log.debug("Calculating coupling degrees (in/out degree) of nodes...");
    calculateNodeDegrees(projectGraph);
    log.debug("\u2705 Coupling degrees calculated.");
    log.debug("Phase 3: Starting resolution of this.fieldName in constructors...");
    const existingUniqueIds = /* @__PURE__ */ new Set();
    data.files.forEach((fileData) => {
      function collectUniqueIds(symbols) {
        if (!symbols) {
          return;
        }
        for (const s of symbols) {
          if (s.uniqueId) {
            existingUniqueIds.add(s.uniqueId);
          }
          if (s.children) {
            collectUniqueIds(s.children);
          }
        }
      }
      collectUniqueIds(fileData.symbols);
    });
    data.files.forEach((fileData) => {
      function findClassAndResolveThisFieldsRecursive(symbols) {
        if (!symbols) {
          return;
        }
        for (const s of symbols) {
          log.debug(`[DEBUG-KIND-CHECK] Symbol: ${s.name}, kind: ${s.kind}, children: ${s.children?.length ?? 0}`);
          if (s.kind === vscode24.SymbolKind.Class && s.children) {
            const classSymbol = s;
            log.debug(`[DEBUG-CLASS] Class detected: ${classSymbol.name}`);
            classSymbol.children?.forEach((member) => {
              log.debug(`[DEBUG-MEMBER] ${classSymbol.name}.${member.name || "(anon)"} - kind: ${member.kind}, params: ${member.parameters?.length ?? 0}`);
              if (member.kind === vscode24.SymbolKind.Constructor) {
                log.debug(`[DEBUG-CONSTRUCTOR] Constructor found: ${member.name}`);
                if (!member.parameters || member.parameters.length === 0) {
                  if (member.detail?.includes("this.")) {
                    log.debug(`  Constructor '${member.name}' without relevant parameters (self_field)`);
                  } else {
                    log.debug(`  \u26A0\uFE0F Constructor '${member.name}' has no parameters. Missing enrichment?`);
                  }
                }
                if (member.parameters && member.parameters.length > 0) {
                  if (!member.parentId && classSymbol.uniqueId) {
                    member.parentId = classSymbol.uniqueId;
                    log.debug(`[DEBUG-RELATIONSHIP] Established parent of constructor ${member.name || "(default)"} -> ${classSymbol.uniqueId}`);
                  }
                  log.debug(`  [ResolveThisField] Processing constructor ${classSymbol.name}.${member.name || "(default)"}`);
                  member.parameters.forEach((param) => {
                    if (param.type?.startsWith("self_field:")) {
                      const fieldName = param.type.substring("self_field:".length);
                      const fieldSymbol = findClassFieldSymbol(classSymbol, fieldName);
                      if (fieldSymbol) {
                        if (fieldSymbol.resolvedType) {
                          log.debug(`    \u21B3 Param '${param.name || fieldName}' (this.${fieldName}): type updated from '${param.type}' to '${fieldSymbol.resolvedType}'. Linked def: ${!!fieldSymbol.resolvedTypeRef?.definition}`);
                          param.type = fieldSymbol.resolvedType;
                          param.typeRef = fieldSymbol.resolvedTypeRef ? { ...fieldSymbol.resolvedTypeRef } : { name: fieldSymbol.resolvedType };
                        } else {
                          log.debug(`    \u26A0\uFE0F Param '${param.name || fieldName}' (this.${fieldName}): field found but no resolvedType in ${classSymbol.name}`);
                          param.typeRef = { name: param.type };
                        }
                      } else {
                        log.debug(`    \u274C Param '${param.name || fieldName}': field '${fieldName}' NOT found in ${classSymbol.name}`);
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
        log.debug(`[DEBUG] \u26A0\uFE0F fileData.symbols is empty for: ${fileData.fileUri}`);
      }
    });
    log.debug(`[DEBUG-VALIDATE] Verifying consistency of parentId \u2194 uniqueId...`);
    data.files.forEach((fileData) => validateParentIds2(fileData.symbols));
    log.debug("[\u2713] Resolution of this.fieldName fields in constructors completed.");
  }
  const ownPackage = readOwnPackageName(data.projectRoot);
  const dataForWebview = {
    projectRoot: data.projectRoot,
    graph: projectGraph,
    fileImports,
    ownPackage,
    architecture: viewArchitecture(loadedArchitecture.architecture),
    auditConfig: readAuditConfig((key) => vscode24.workspace.getConfiguration("satori").get(key)),
    importTargets: resolveImportTargets(data.projectRoot, fileImports, ownPackage)
  };
  log.debug("[Sanitize] Starting string sanitization for JSON...");
  sanitizeObjectStrings(dataForWebview);
  log.debug("[Sanitize] String sanitization completed.");
  const savedAnnotations = loadAnnotations(context.workspaceState, data.projectRoot);
  const astJson = JSON.stringify({ ...dataForWebview, annotations: savedAnnotations }, (key, value) => {
    if (typeof value === "string") {
      return value.replace(/\\/g, "/");
    }
    return value;
  }).replace(/</g, "\\u003c");
  log.debug(`[DEBUG_JSON] Total length of astJson: ${astJson.length}`);
  if (!data.cached) {
    validateEnrichedData(data.files);
  }
  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);
  const translations = Localization.getInstance().getByPrefix("trail.", "hud.", "layer.");
  const mediaUri = panel.webview.asWebviewUri(vscode24.Uri.joinPath(context.extensionUri, "media")).toString();
  let html = fs14.readFileSync(
    import_path7.default.join(context.extensionUri.fsPath, "media", "webviewContent.html"),
    "utf8"
  );
  html = html.replace(/__CSP__/, () => csp).replace(/__MEDIA__/g, () => mediaUri).replace(/__NONCE__/g, () => nonce).replace(/__AST_JSON_PLACEHOLDER__/g, () => astJson).replace(/__TRANSLATIONS__/g, () => JSON.stringify(translations).replace(/</g, "\\u003c"));
  reporter.start("draw");
  panel.webview.html = html;
  const finishedAt = Date.now();
  return {
    panel,
    graph: projectGraph,
    fileImports,
    timings: { enrichMs: enrichedAt - startedAt, graphMs: graphBuiltAt - enrichedAt - relationsWaitMs, finishMs: finishedAt - graphBuiltAt, relationsWaitMs, engine }
  };
}
function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

// src/analysis/graph_cache.ts
var fs15 = __toESM(require("fs"));
var path17 = __toESM(require("path"));
var crypto = __toESM(require("crypto"));

// src/analysis/analysis_health.ts
var MIN_SHARE_WITH_SYMBOLS = 0.5;
function symbolsLookComplete(stats) {
  return stats.files > 0 && stats.withSymbols / stats.files >= MIN_SHARE_WITH_SYMBOLS;
}
function isHealthy(stats) {
  return stats.classes > 0 && symbolsLookComplete(stats);
}
function likelyCauses(facts) {
  const causes = [];
  if (!facts.workspaceTrusted) {
    causes.push({ id: "untrusted", args: [] });
  }
  if (!facts.dartExtensionActive) {
    causes.push({ id: "dartInactive", args: [] });
  }
  if (!facts.isProjectRoot) {
    causes.push({ id: "noPubspec", args: [] });
  } else if (!facts.hasPackageConfig) {
    causes.push({ id: "noPackageConfig", args: [] });
  }
  if (facts.leftOutBySatori > 0) {
    causes.push({ id: "leftOut", args: [String(facts.leftOutBySatori)] });
  }
  causes.push({ id: "warming", args: [] });
  return causes;
}

// src/analysis/graph_cache.ts
var CACHE_LAYOUT = 3;
function fingerprintOf(stamps, extra = []) {
  const hash = crypto.createHash("sha1");
  stamps.map((s) => `${s.path}|${s.size}|${Math.round(s.mtimeMs)}`).sort().forEach((line) => hash.update(line + "\n"));
  extra.forEach((text) => hash.update("extra|" + text + "\n"));
  return hash.digest("hex");
}
function stampFiles(files) {
  const stamps = [];
  for (const file of files) {
    try {
      const st = fs15.statSync(file);
      stamps.push({ path: file, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
    }
  }
  return stamps;
}
function cacheFileFor(storageDir, projectRoot) {
  const key = crypto.createHash("sha1").update(projectRoot.toLowerCase()).digest("hex").slice(0, 16);
  return path17.join(storageDir, `analysis-${key}.json`);
}
function readCachedAnalysis(file, fingerprint, extensionVersion) {
  try {
    if (!fs15.existsSync(file)) {
      return null;
    }
    const cached = JSON.parse(fs15.readFileSync(file, "utf8"));
    if (cached.layout !== CACHE_LAYOUT || cached.extensionVersion !== extensionVersion || cached.fingerprint !== fingerprint) {
      return null;
    }
    if (!cached.stats || !isHealthy(cached.stats)) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}
function writeCachedAnalysis(file, fingerprint, extensionVersion, graph, fileImports, stats) {
  const entry = { layout: CACHE_LAYOUT, extensionVersion, fingerprint, savedAt: Date.now(), stats, graph, fileImports };
  fs15.mkdirSync(path17.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs15.writeFileSync(temp, JSON.stringify(entry));
  fs15.renameSync(temp, file);
}
function clearCachedAnalyses(storageDir) {
  let removed = 0;
  let names = [];
  try {
    names = fs15.readdirSync(storageDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (/^analysis-[0-9a-f]+(\.state)?\.json(\.\d+\.tmp)?$/.test(name)) {
      try {
        fs15.unlinkSync(path17.join(storageDir, name));
        removed++;
      } catch {
      }
    }
  }
  return removed;
}

// src/analysis/adaptive_wait.ts
var DEFAULT_DELAYS_MS = [3e3, 5e3, 8e3, 12e3, 15e3, 2e4, 25e3, 3e4];
async function waitForSymbols(initial, options) {
  let stats = initial;
  let best = initial.withSymbols;
  let stalled = 0;
  let waited = 0;
  let rounds = 0;
  for (let i = 0; i < options.delaysMs.length; i++) {
    if (symbolsLookComplete(stats)) {
      return { rounds, waitedMs: waited, stats, end: "complete" };
    }
    const delay = options.delaysMs[i];
    options.onWait?.(i + 1, delay, stats);
    await options.sleep(delay);
    waited += delay;
    stats = await options.round(i + 1);
    rounds++;
    if (stats.withSymbols > best) {
      best = stats.withSymbols;
      stalled = 0;
    } else {
      stalled++;
    }
    if (symbolsLookComplete(stats)) {
      return { rounds, waitedMs: waited, stats, end: "complete" };
    }
    if (stalled >= options.stallLimit) {
      return { rounds, waitedMs: waited, stats, end: "stalled" };
    }
  }
  return { rounds, waitedMs: waited, stats, end: symbolsLookComplete(stats) ? "complete" : "ran-out" };
}

// src/analysis/navigation_runner.ts
var fs16 = __toESM(require("fs"));
var path18 = __toESM(require("path"));
var vscode25 = __toESM(require("vscode"));

// src/lsp/analysis_server.ts
var cp = __toESM(require("child_process"));
var DartAnalysisClient = class {
  constructor(executable, args = ["language-server", "--protocol=analyzer"], spawnFn = cp.spawn) {
    this.executable = executable;
    this.args = args;
    this.spawnFn = spawnFn;
  }
  child;
  buffer = "";
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  analysisFinished;
  analysisFailed;
  closed = false;
  /** Starts the server and checks that it answers. */
  async start() {
    const needsShell = process.platform === "win32" && /\.(bat|cmd)$/i.test(this.executable);
    this.child = this.spawnFn(this.executable, this.args, { stdio: ["pipe", "pipe", "ignore"], shell: needsShell });
    this.child.on("error", (err) => this.failAll(err));
    this.child.on("exit", () => {
      this.closed = true;
      this.failAll(new Error("the analysis server stopped"));
    });
    this.child.stdout?.on("data", (chunk) => this.onData(chunk.toString()));
    const reply = await this.request("server.getVersion", {});
    return String(reply.result?.version ?? "");
  }
  /**
   * Points the server at a project and waits until it has finished analysing it. `included` narrows the analysis
   * to some files or folders of it: the rest is only read as far as those files need it.
   */
  async analyze(root, timeoutMs, included = [root]) {
    let timer;
    const finished = new Promise((resolve4, reject) => {
      this.analysisFinished = resolve4;
      this.analysisFailed = reject;
      timer = setTimeout(() => reject(new Error("the analysis server did not finish in " + Math.round(timeoutMs / 1e3) + "s")), timeoutMs);
    });
    try {
      await this.request("server.setSubscriptions", { subscriptions: ["STATUS"] });
      await this.request("analysis.setAnalysisRoots", { included, excluded: [] });
      await finished;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      this.analysisFinished = void 0;
      this.analysisFailed = void 0;
    }
  }
  /** Where every identifier of `file` points to. */
  async getNavigation(file, length) {
    const reply = await this.request("analysis.getNavigation", { file, offset: 0, length });
    const result = reply.result;
    return { files: result?.files ?? [], targets: result?.targets ?? [], regions: result?.regions ?? [] };
  }
  dispose() {
    this.closed = true;
    try {
      this.child?.kill();
    } catch {
    }
    this.failAll(new Error("the analysis client was closed"));
  }
  request(method, params) {
    if (this.closed || !this.child?.stdin) {
      return Promise.reject(new Error("the analysis server is not running"));
    }
    const id = String(this.nextId++);
    return new Promise((resolve4, reject) => {
      this.pending.set(id, {
        resolve: (message) => message.error ? reject(new Error(`${message.error.code}: ${message.error.message}`)) : resolve4(message),
        reject
      });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  onData(text) {
    this.buffer += text;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id !== void 0 && this.pending.has(String(message.id))) {
        const pending = this.pending.get(String(message.id));
        this.pending.delete(String(message.id));
        pending.resolve(message);
      } else if (message.event === "server.status" && message.params?.analysis && message.params.analysis.isAnalyzing === false) {
        this.analysisFinished?.();
      }
    }
  }
  failAll(error) {
    this.analysisFailed?.(error);
    this.pending.forEach((p) => p.reject(error));
    this.pending.clear();
  }
};

// src/analysis/navigation_index.ts
function normalizePath(p) {
  const slashes = p.replace(/\\/g, "/");
  return /^[a-zA-Z]:/.test(slashes) ? slashes[0].toLowerCase() + slashes.slice(1) : slashes;
}
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}
function positionAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = low + high + 1 >> 1;
    if (starts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { line: low, character: offset - starts[low] };
}
function pathOfKey(key) {
  const second = key.lastIndexOf(":", key.lastIndexOf(":") - 1);
  return key.slice(0, second);
}
var NavigationIndex = class _NavigationIndex {
  byTarget = /* @__PURE__ */ new Map();
  static key(path21, line, character) {
    return `${normalizePath(path21)}:${line}:${character}`;
  }
  /** The uses of the symbol declared at this position (0-based) of this file, or an empty list. */
  referencesTo(path21, line, character) {
    return this.byTarget.get(_NavigationIndex.key(path21, line, character)) ?? [];
  }
  get size() {
    return this.byTarget.size;
  }
  /** Everything the index holds, to be saved: [where the symbol is declared, where it is used]. */
  toJSON() {
    return Array.from(this.byTarget.entries());
  }
  static fromJSON(entries) {
    const index = new _NavigationIndex();
    for (const [key, usages] of entries) {
      index.byTarget.set(key, usages);
    }
    return index;
  }
  /** The URIs of the files that use something declared in one of these files (paths normalised, as in key()). */
  filesUsingDeclarationsIn(paths) {
    const users = /* @__PURE__ */ new Set();
    for (const [key, usages] of this.byTarget) {
      if (paths.has(pathOfKey(key))) {
        usages.forEach((u) => users.add(u.uri));
      }
    }
    return users;
  }
  /**
   * Forgets what is known about some files, to ask again: the declarations they hold (their positions may have
   * moved) and the uses that appear in them.
   */
  forget(declaredIn, usedIn) {
    for (const [key, usages] of this.byTarget) {
      if (declaredIn.has(pathOfKey(key))) {
        this.byTarget.delete(key);
        continue;
      }
      if (usedIn.size === 0) {
        continue;
      }
      const kept = usages.filter((u) => !usedIn.has(u.uri));
      if (kept.length === 0) {
        this.byTarget.delete(key);
      } else if (kept.length !== usages.length) {
        this.byTarget.set(key, kept);
      }
    }
  }
  /** Adds everything another index knows. */
  absorb(other) {
    for (const [key, usages] of other.byTarget) {
      const list = this.byTarget.get(key);
      if (list) {
        list.push(...usages);
      } else {
        this.byTarget.set(key, usages.slice());
      }
    }
  }
  /**
   * Adds what one file says about its identifiers.
   * @param usageUri URI of the file the navigation belongs to
   * @param text the file's contents, to turn offsets into lines and columns
   * @param keepTarget decides which declarations are worth remembering (the project's own files)
   * @param selfPath path of the file the navigation belongs to, to tell a declaration from a use of it
   */
  addFile(result, usageUri, text, keepTarget, selfPath) {
    const starts = lineStarts(text);
    const keep = result.targets.map((t2) => keepTarget(result.files[t2.fileIndex] ?? ""));
    for (const region of result.regions) {
      const word = text.substr(region.offset, region.length);
      if (word === "this" || word === "super") {
        continue;
      }
      let usage;
      for (const index of region.targets) {
        const target = result.targets[index];
        if (!target || !keep[index]) {
          continue;
        }
        if (region.offset === target.offset && result.files[target.fileIndex] !== void 0 && normalizePath(result.files[target.fileIndex]) === normalizePath(selfPath)) {
          continue;
        }
        if (!usage) {
          const start = positionAt(starts, region.offset);
          const end = positionAt(starts, region.offset + region.length);
          usage = { uri: usageUri, line: start.line, character: start.character, endLine: end.line, endCharacter: end.character };
        }
        const key = _NavigationIndex.key(result.files[target.fileIndex], target.startLine - 1, target.startColumn - 1);
        const list = this.byTarget.get(key);
        if (list) {
          list.push(usage);
        } else {
          this.byTarget.set(key, [usage]);
        }
      }
    }
  }
};

// src/analysis/navigation_runner.ts
var REQUESTS_IN_FLIGHT = 8;
var ANALYSIS_TIMEOUT_MS = 20 * 60 * 1e3;
async function buildNavigationIndex(projectRoot, files, reporter = silentReporter, ask) {
  const engine = vscode25.workspace.getConfiguration("satori").get("analysis.engine", "auto");
  if (engine === "languageServer") {
    log.info("Relationships are asked one by one to the language server (satori.analysis.engine).");
    reporter.finish("relations");
    return null;
  }
  const found = findDartSdk();
  if (!found) {
    reporter.finish("relations");
    return null;
  }
  const dart = realDartExecutable(found, fs16.existsSync);
  const client = new DartAnalysisClient(dart);
  try {
    reporter.start("relations", t("loading.relations.starting"));
    const t0 = Date.now();
    const version = await client.start();
    log.debug(`[Navigation] analysis server ${version} started with ${dart}`);
    const t1 = Date.now();
    reporter.start("relations", t("loading.relations.analyzing"));
    await client.analyze(path18.resolve(projectRoot), ANALYSIS_TIMEOUT_MS, ask ? ask.map((u) => path18.resolve(u.fsPath)) : void 0);
    const t2 = Date.now();
    const projectFiles = new Set(files.map((u) => normalizePath(u.fsPath)));
    const index = new NavigationIndex();
    await mapLimited(ask ?? files, REQUESTS_IN_FLIGHT, async (uri) => {
      const text = fs16.readFileSync(uri.fsPath, "utf8");
      const result = await client.getNavigation(uri.fsPath, text.length);
      index.addFile(result, uri.toString(), text, (p) => projectFiles.has(normalizePath(p)), uri.fsPath);
    }, (done, total) => reporter.progress("relations", done, total, t("loading.relations.reading")));
    reporter.finish("relations");
    const t3 = Date.now();
    return { index, files: (ask ?? files).length, startMs: t1 - t0, analyzeMs: t2 - t1, navigationMs: t3 - t2 };
  } catch (error) {
    log.info(`The analysis server could not be used (${error.message}); asking the language server instead.`);
    reporter.finish("relations");
    return null;
  } finally {
    client.dispose();
  }
}

// src/analysis/incremental_state.ts
var fs17 = __toESM(require("fs"));
var path19 = __toESM(require("path"));
var STATE_LAYOUT = 1;
function stateFileFor(cacheFile) {
  return cacheFile.replace(/\.json$/, ".state.json");
}
function writeStateParts(file, meta, filesJson, fileImports, usages) {
  fs17.mkdirSync(path19.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  const header = JSON.stringify({ layout: STATE_LAYOUT, extensionVersion: meta.extensionVersion, savedAt: Date.now(), stamps: meta.stamps, hasNavigation: meta.hasNavigation });
  fs17.writeFileSync(temp, header.slice(0, -1) + ',"files":' + filesJson + ',"fileImports":' + JSON.stringify(fileImports) + ',"usages":' + JSON.stringify(usages) + "}");
  fs17.renameSync(temp, file);
}
function readState(file, extensionVersion) {
  try {
    if (!fs17.existsSync(file)) {
      return null;
    }
    const state = JSON.parse(fs17.readFileSync(file, "utf8"));
    if (state.layout !== STATE_LAYOUT || state.extensionVersion !== extensionVersion) {
      return null;
    }
    if (!Array.isArray(state.stamps) || !Array.isArray(state.files) || !Array.isArray(state.usages)) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}
var isPosition = (v) => typeof v === "object" && v !== null && typeof v.line === "number" && typeof v.character === "number";
function reviveRanges(value, makeRange2) {
  const walk = (node) => {
    if (Array.isArray(node)) {
      if (node.length === 2 && isPosition(node[0]) && isPosition(node[1])) {
        return makeRange2(node[0].line, node[0].character, node[1].line, node[1].character);
      }
      for (let i = 0; i < node.length; i++) {
        node[i] = walk(node[i]);
      }
      return node;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        node[key] = walk(node[key]);
      }
    }
    return node;
  };
  return walk(value);
}

// src/ui/incremental_analysis.ts
var vscode26 = __toESM(require("vscode"));

// src/analysis/incremental.ts
function diffStamps(before, now) {
  const was = new Map(before.map((s) => [normalizePath(s.path), s]));
  const changed = [];
  const added = [];
  for (const stamp of now) {
    const path21 = normalizePath(stamp.path);
    const old = was.get(path21);
    if (!old) {
      added.push(path21);
    } else if (old.size !== stamp.size || Math.round(old.mtimeMs) !== Math.round(stamp.mtimeMs)) {
      changed.push(path21);
    }
    was.delete(path21);
  }
  return { changed, added, deleted: Array.from(was.keys()) };
}
var INCREMENTAL_MAX_SHARE = 0.2;
var INCREMENTAL_MIN_FILES = 25;
function planAnalysis(totalFiles, diff, dependents) {
  const touched = diff.changed.length + diff.added.length + diff.deleted.length;
  if (touched === 0) {
    return { mode: "reuse", reason: "no file changed" };
  }
  const toAsk = diff.changed.length + diff.added.length + dependents;
  const limit = Math.max(INCREMENTAL_MIN_FILES, Math.floor(totalFiles * INCREMENTAL_MAX_SHARE));
  if (toAsk > limit) {
    return { mode: "full", reason: `${toAsk} files to ask about again is more than ${limit}` };
  }
  return { mode: "incremental", reason: `${diff.changed.length} changed, ${diff.added.length} new, ${diff.deleted.length} deleted, ${dependents} that use them` };
}

// src/ui/incremental_analysis.ts
var makeRange = (a, b, c, d) => new vscode26.Range(a, b, c, d);
async function prepareIncremental(input) {
  const { state, uris } = input;
  if (!state.hasNavigation) {
    return { ok: false, reason: "the saved state has no relationships from the analysis server" };
  }
  const diff = diffStamps(state.stamps, input.stamps);
  const index = NavigationIndex.fromJSON(state.usages);
  const declaredAgain = /* @__PURE__ */ new Set([...diff.changed, ...diff.deleted]);
  const byUri = new Map(uris.map((u) => [u.toString(), u]));
  const byPath = new Map(uris.map((u) => [normalizePath(u.fsPath), u]));
  const askPaths = /* @__PURE__ */ new Set([...diff.changed, ...diff.added]);
  const dependentPaths = [];
  for (const uri of index.filesUsingDeclarationsIn(declaredAgain)) {
    const file = byUri.get(uri);
    if (!file) {
      continue;
    }
    const filePath = normalizePath(file.fsPath);
    if (!askPaths.has(filePath)) {
      dependentPaths.push(filePath);
      askPaths.add(filePath);
    }
  }
  const plan = planAnalysis(uris.length, diff, dependentPaths.length);
  if (plan.mode === "full") {
    return { ok: false, reason: plan.reason };
  }
  const ask = Array.from(askPaths).map((p) => byPath.get(p)).filter((u) => !!u);
  const savedByPath = new Map(state.files.map((f) => [normalizePath(f.file), f]));
  let fresh = [];
  let stats = { files: 0, withSymbols: 0, errors: 0 };
  if (ask.length > 0) {
    const read = await input.extractSymbols(ask);
    fresh = read.files;
    stats = read.stats;
    const emptied = fresh.filter((f) => f.symbols.length === 0 && (savedByPath.get(normalizePath(f.file))?.symbols.length ?? 0) > 0);
    if (emptied.length > 0 || stats.withSymbols < ask.length * 0.5) {
      return { ok: false, reason: `the language server returned no symbols for ${emptied.length || ask.length - stats.withSymbols} of ${ask.length} files it was asked about` };
    }
  }
  let nav = { index, files: 0, startMs: 0, analyzeMs: 0, navigationMs: 0 };
  if (ask.length > 0) {
    nav = await input.askNavigation(ask);
    if (!nav) {
      return { ok: false, reason: "the analysis server could not be used" };
    }
    const usedIn = new Set(ask.map((u) => u.toString()));
    for (const path21 of diff.deleted) {
      const gone = savedByPath.get(path21);
      if (gone) {
        usedIn.add(gone.fileUri);
      }
    }
    index.forget(declaredAgain, usedIn);
    index.absorb(nav.index);
    nav = { ...nav, index };
  } else if (diff.deleted.length > 0) {
    const usedIn = /* @__PURE__ */ new Set();
    for (const path21 of diff.deleted) {
      const gone = savedByPath.get(path21);
      if (gone) {
        usedIn.add(gone.fileUri);
      }
    }
    index.forget(declaredAgain, usedIn);
  }
  const freshByPath = new Map(fresh.map((f) => [normalizePath(f.file), f]));
  const files = [];
  const reusedImports = {};
  let reused = 0;
  for (const uri of uris) {
    const path21 = normalizePath(uri.fsPath);
    const again = freshByPath.get(path21);
    if (again) {
      files.push(again);
      continue;
    }
    const saved = savedByPath.get(path21);
    if (!saved) {
      return { ok: false, reason: `${path21} is neither new nor in the saved state` };
    }
    files.push({ file: saved.file, fileUri: saved.fileUri, symbols: reviveRanges(saved.symbols, makeRange), enriched: true });
    const imports = state.fileImports[saved.fileUri];
    if (imports) {
      reusedImports[saved.fileUri] = imports;
    }
    reused++;
  }
  log.info(`Incremental analysis: ${plan.reason}; ${ask.length} files asked again, ${reused} reused.`);
  return {
    ok: true,
    plan,
    files,
    navigation: nav,
    reusedImports,
    asked: ask.length,
    reused,
    stats: { files: files.length, withSymbols: files.filter((f) => f.symbols.length > 0).length, errors: 0 }
  };
}

// src/ui/progress_reporter.ts
var QUIP_FIRST_MS = 4e3;
var QUIP_EVERY_MS = 8e3;
function shuffled(items, random) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
var NotificationReporter = class {
  constructor(sink, texts, now = Date.now, tickMs = 1e3, random = Math.random) {
    this.sink = sink;
    this.texts = texts;
    this.now = now;
    this.quips = shuffled(texts.quips ?? [], random);
    this.state = new LoadingState(texts.labels);
    this.startedAt = now();
    this.throttle = new Throttle(() => this.emit(), 200, now);
    this.ticker = setInterval(() => this.emit(), tickMs);
    this.emit();
  }
  state;
  throttle;
  startedAt;
  lastOverall = 0;
  quips;
  ticker;
  start(id, detail = "") {
    this.state.start(id, detail);
    this.throttle.request();
  }
  progress(id, done, total, detail) {
    this.state.progress(id, done, total, detail);
    this.throttle.request();
  }
  finish(id) {
    this.state.finish(id);
    this.throttle.request();
  }
  /** Stops the clock; call it when the analysis ends, however it ends. */
  release() {
    this.throttle.cancel();
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = void 0;
    }
  }
  /** The message for the current state. */
  message() {
    const snapshot = this.state.snapshot();
    const active = snapshot.phases.filter((p) => p.status === "active");
    const slowest = active.sort((a, b) => fraction(a) - fraction(b))[0];
    const current = slowest ?? snapshot.phases.find((p) => p.status === "pending");
    const percent = `${Math.round(snapshot.overall * 100)}%`;
    const parts = [percent];
    if (current) {
      let text = current.label;
      if (current.total > 0) {
        text += ` (${current.done}/${current.total})`;
      } else if (current.detail) {
        text += ` - ${current.detail}`;
      }
      parts.push(text);
    }
    const elapsed = this.now() - this.startedAt;
    parts.push(`${this.texts.elapsed} ${formatElapsed(elapsed)}`);
    const quip = this.quip(elapsed);
    if (quip) {
      parts.push(quip);
    }
    return parts.join(" \xB7 ");
  }
  /** The phrase for this moment of the wait: none at first, then one after another. */
  quip(elapsedMs) {
    if (this.quips.length === 0 || elapsedMs < QUIP_FIRST_MS) {
      return void 0;
    }
    const turn = Math.floor((elapsedMs - QUIP_FIRST_MS) / QUIP_EVERY_MS);
    return this.quips[turn % this.quips.length];
  }
  emit() {
    const overall = this.state.snapshot().overall;
    const increment = Math.max(0, (overall - this.lastOverall) * 100);
    this.lastOverall = Math.max(this.lastOverall, overall);
    this.sink.report({ increment, message: this.message() });
  }
};
function fraction(p) {
  return p.total > 0 ? p.done / p.total : 0;
}

// src/ui/command_registry.ts
var vscode27 = __toESM(require("vscode"));
function registerDebugCommands(context) {
  const toggleDebugCommand = vscode27.commands.registerCommand(
    "satori.toggleDebugLogs",
    () => {
      const currentState = log.isDebug();
      log.setDebug(!currentState);
      vscode27.window.showInformationMessage(
        `Debug logs ${!currentState ? "enabled" : "disabled"}`
      );
    }
  );
  context.subscriptions.push(toggleDebugCommand);
}

// src/analysis/symbol_transformer.ts
function transformLspSymbols(lspSymbols, parentId, fileUri) {
  if (!lspSymbols || lspSymbols.length === 0) {
    return [];
  }
  return lspSymbols.map((s) => {
    const uniqueId = `${fileUri}#${s.name}#${s.kind}`;
    const enriched = {
      name: s.name,
      kind: s.kind,
      detail: s.detail || "",
      range: s.range,
      selectionRange: s.selectionRange,
      fileUri,
      uniqueId,
      parentId,
      children: []
    };
    enriched.children = transformLspSymbols(s.children ?? [], uniqueId, fileUri);
    return enriched;
  });
}

// src/analysis/snippet.ts
var fs18 = __toESM(require("fs"));
var vscode28 = __toESM(require("vscode"));
var MAX_LINES = 60;
var CONTEXT = 3;
function stripDecor(label) {
  return label.replace(/^(?:\u{1F517}|⚙️?)\s*/u, "");
}
function rangeOf(node) {
  const raw = node.data.range ?? node.data.selectionRange;
  if (!raw) {
    return null;
  }
  const start = Array.isArray(raw) ? raw[0] : raw.start;
  const end = Array.isArray(raw) ? raw[1] : raw.end;
  if (!start || !end) {
    return null;
  }
  return { start: { line: start.line, character: start.character }, end: { line: end.line, character: end.character } };
}
function escapeRegExp2(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildLineSnippet(fileUri, line, column, length) {
  let fileLines;
  try {
    fileLines = fs18.readFileSync(vscode28.Uri.parse(fileUri).fsPath, "utf8").split(/\r?\n/);
  } catch {
    return null;
  }
  if (!Number.isInteger(line) || line < 0 || line >= fileLines.length) {
    return null;
  }
  const from = Math.max(0, line - CONTEXT - 1);
  const to = Math.min(fileLines.length - 1, line + CONTEXT + 1);
  return {
    file: fileUri,
    startLine: from,
    lines: fileLines.slice(from, to + 1),
    highlightLine: line,
    jump: { start: { line, character: column }, end: { line, character: column + Math.max(1, length) } },
    title: fileLines[line].trim()
  };
}
function buildSnippet(graph, request) {
  if (request.fileUri !== void 0 && request.line !== void 0) {
    return buildLineSnippet(request.fileUri, request.line, request.column ?? 0, request.length ?? 1);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const primary = byId.get(request.sourceId ?? request.nodeId ?? "");
  if (!primary || !primary.data.fileUri) {
    return null;
  }
  const range = rangeOf(primary);
  if (!range) {
    return null;
  }
  let content;
  try {
    content = fs18.readFileSync(vscode28.Uri.parse(primary.data.fileUri).fsPath, "utf8");
  } catch {
    return null;
  }
  const fileLines = content.split(/\r?\n/);
  if (range.start.line >= fileLines.length) {
    return null;
  }
  let highlightLine = null;
  let highlightColumn = range.start.character;
  let matchLength = Math.max(1, range.end.line === range.start.line ? range.end.character - range.start.character : 1);
  let title = stripDecor(primary.label);
  const target = request.targetId ? byId.get(request.targetId) : void 0;
  if (target) {
    const name = stripDecor(target.label);
    const pattern = new RegExp(`\\b${escapeRegExp2(name)}\\b`);
    const lastLine = Math.min(range.end.line, fileLines.length - 1);
    for (let i = range.start.line; i <= lastLine; i++) {
      const text = fileLines[i];
      if (text.trimStart().startsWith("//")) {
        continue;
      }
      const match = pattern.exec(i === range.start.line ? text.substring(range.start.character) : text);
      if (match) {
        highlightLine = i;
        highlightColumn = match.index + (i === range.start.line ? range.start.character : 0);
        matchLength = name.length;
        break;
      }
    }
    title = `${stripDecor(primary.label)} -> ${name}`;
  }
  if (!target && range.end.line === range.start.line) {
    highlightLine = range.start.line;
  }
  const lastLineOfSymbol = Math.min(range.end.line, fileLines.length - 1);
  let from = range.start.line;
  let to = lastLineOfSymbol;
  if (to - from < 1) {
    from = Math.max(0, from - CONTEXT);
    to = Math.min(fileLines.length - 1, to + CONTEXT + 1);
  }
  if (to - from + 1 > MAX_LINES) {
    const anchor = highlightLine ?? range.start.line;
    from = Math.max(range.start.line, anchor - Math.floor(MAX_LINES / 2));
    to = Math.min(lastLineOfSymbol, from + MAX_LINES - 1);
    from = Math.max(range.start.line, to - MAX_LINES + 1);
  }
  const jumpLine = highlightLine ?? range.start.line;
  return {
    file: primary.data.fileUri,
    startLine: from,
    lines: fileLines.slice(from, to + 1),
    highlightLine,
    jump: {
      start: { line: jumpLine, character: highlightColumn },
      end: { line: jumpLine, character: highlightColumn + matchLength }
    },
    title
  };
}

// src/ui/extension_lifecycle.ts
var ExtensionState = class {
  mainGraphPanel;
  projectGraph;
  stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
  timings;
  /** The folder that was analysed, to know where satori.json goes. */
  projectRoot;
  /**
   * Sets the webview panel and project graph in the global state.
   *
   * @param panel - Webview panel that displays the graph visualization
   * @param graph - Graph data model with the project's nodes and edges
   */
  setGraph(panel, graph) {
    this.mainGraphPanel = panel;
    this.projectGraph = graph;
    this.stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
  }
  /**
   * Clears the global state, releasing references to the panel and graph.
   * Typically called when the visualization panel is closed.
   */
  clear() {
    this.mainGraphPanel = void 0;
    this.projectGraph = void 0;
    this.stats = { webviewReady: false, snippetsServed: 0, relationshipUpdates: 0, annotationSaves: 0 };
  }
  /**
   * Gets the active webview panel of the graph.
   * 
   * @returns Webview panel if active, undefined otherwise
   */
  getPanel() {
    return this.mainGraphPanel;
  }
  /**
   * Gets the current project graph data model.
   * 
   * @returns Project graph model if available, undefined otherwise
   */
  getGraph() {
    return this.projectGraph;
  }
};
async function findFlutterProjectRoot() {
  const workspaceFolders = vscode29.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode29.window.showErrorMessage("No workspace folder found. Please open a Flutter project.");
    return void 0;
  }
  for (const folder of workspaceFolders) {
    const pubspecFiles = await vscode29.workspace.findFiles(
      new vscode29.RelativePattern(folder, "pubspec.yaml"),
      "**/.*",
      1
    );
    if (pubspecFiles.length > 0) {
      log.debug(`\u2705 Found pubspec.yaml at: ${pubspecFiles[0].fsPath}`);
      log.debug(`\u{1F4C1} Project root: ${folder.uri.fsPath}`);
      return folder.uri;
    }
  }
  vscode29.window.showErrorMessage("No Flutter project found. Make sure pubspec.yaml exists in your workspace.");
  return void 0;
}
async function discoverDartFiles(rootUri, isProjectRoot) {
  const root = rootUri.fsPath;
  const uris = [];
  const pattern = isProjectRoot ? "lib/**/*.dart" : "**/*.dart";
  try {
    const files = await vscode29.workspace.findFiles(
      new vscode29.RelativePattern(rootUri, pattern),
      "**/.dart_tool/**"
    );
    uris.push(...files);
    log.debug(`  \u2022 Pattern '${pattern}': ${files.length} files`);
  } catch (error) {
    log.error(`  \u274C Error searching pattern '${pattern}': ${error.message}`);
  }
  if (isProjectRoot) {
    let customDirectories = [];
    try {
      customDirectories = await findCustomDartDirectories(rootUri);
      log.debug(`\u{1F50D} Found ${customDirectories.length} custom directories`);
    } catch (error) {
      log.error(`\u274C Error finding custom directories: ${error.message}`);
    }
    for (const customDir of customDirectories) {
      try {
        const customFiles = await vscode29.workspace.findFiles(
          new vscode29.RelativePattern(customDir, "**/*.dart"),
          "**/.*"
        );
        uris.push(...customFiles);
        log.debug(` \u2022 Custom directory '${import_path8.default.relative(root, customDir.fsPath)}': ${customFiles.length} files`);
      } catch (error) {
        log.error(`  \u274C Error in custom directory ${customDir.fsPath}: ${error.message}`);
      }
    }
  } else {
    log.debug(`\u{1F4CA} Skipping custom directory search (not in project root)`);
  }
  const found = Array.from(new Set(uris.map((u) => u.toString()))).map((s) => vscode29.Uri.parse(s));
  const patterns = vscode29.workspace.getConfiguration("satori").get("analysis.exclude", DEFAULT_EXCLUDES);
  const isExcluded = makeExcluder(patterns);
  const uniqueUris = found.filter((u) => !isExcluded(import_path8.default.relative(root, u.fsPath)));
  if (uniqueUris.length < found.length) {
    log.info(`Left out ${found.length - uniqueUris.length} of ${found.length} Dart files that match satori.analysis.exclude (generated code by default).`);
  }
  log.debug(`\u{1F4C4} Total unique files found: ${uniqueUris.length}`);
  return { uris: uniqueUris, leftOut: found.length - uniqueUris.length };
}
async function extractFileSymbols(uris, reporter = silentReporter, finishStep = true) {
  let analyzedCount = 0;
  let errorCount = 0;
  let emptyCount = 0;
  let emptyStreak = 0;
  const hasSymbols = (r) => Array.isArray(r) && r.length > 0;
  reporter.start("symbols");
  const filesData = await mapLimited(uris, SYMBOL_REQUEST_CONCURRENCY, async (u) => {
    let syms = [];
    try {
      const ask = async () => await vscode29.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        u
      );
      const delays = emptyStreak >= MAX_EMPTY_FILES_IN_A_ROW ? [] : EMPTY_SYMBOLS_RETRY_DELAYS_MS;
      const outcome = await retryUntil(ask, hasSymbols, delays);
      emptyStreak = outcome.exhausted ? emptyStreak + 1 : 0;
      const raw = outcome.result;
      if (!Array.isArray(raw)) {
        log.debug(`[DIAGNOSTIC] No symbol array for ${import_path8.default.basename(u.fsPath)}: ${raw === null ? "null" : typeof raw}`);
        if (raw === null) {
          emptyCount++;
        } else {
          errorCount++;
        }
      } else if (raw.length === 0) {
        emptyCount++;
      } else {
        analyzedCount++;
      }
      syms = transformLspSymbols(Array.isArray(raw) ? raw : [], void 0, u.toString());
    } catch (e) {
      log.error(`\u26A0\uFE0F Error getting symbols for ${import_path8.default.basename(u.fsPath)}: ${e.message}`);
      errorCount++;
    }
    return { file: normalizePath2(u.fsPath), fileUri: u.toString(), symbols: syms };
  }, (done, total) => reporter.progress("symbols", done, total));
  if (finishStep) {
    reporter.finish("symbols");
  }
  log.debug(`\u{1F4CA} Analysis Summary: ${analyzedCount} analyzed, ${emptyCount} empty, ${errorCount} errors, ${filesData.length} total`);
  return { files: filesData, stats: { files: filesData.length, withSymbols: analyzedCount, errors: errorCount } };
}
var SYMBOL_REQUEST_CONCURRENCY = 8;
var EMPTY_SYMBOLS_RETRY_DELAYS_MS = [250, 750];
var MAX_EMPTY_FILES_IN_A_ROW = 6;
async function analyzeProject(rootUri, context, progress, fresh = false) {
  const root = rootUri.fsPath;
  log.debug(`\u{1F50D} Analyzing project at: ${root}`);
  log.debug(`\u{1F4CA} Root URI - scheme: ${rootUri.scheme}, fsPath: ${rootUri.fsPath}`);
  log.debug(`\u{1F4CA} Root URI - toString: ${rootUri.toString()}`);
  const isProjectRoot = fs19.existsSync(import_path8.default.join(root, "pubspec.yaml"));
  log.debug(`\u{1F4CA} Is project root (has pubspec.yaml): ${isProjectRoot}`);
  const analysisStart = Date.now();
  const loading = new NotificationReporter(progress, {
    labels: {
      files: t("loading.phase.files"),
      symbols: t("loading.phase.symbols"),
      relations: t("loading.phase.relations"),
      types: t("loading.phase.types"),
      graph: t("loading.phase.graph"),
      draw: t("loading.phase.draw")
    },
    elapsed: t("loading.elapsed"),
    // Something to read during a long wait; satori.loading.phrases turns it off.
    quips: vscode29.workspace.getConfiguration("satori").get("loading.phrases", true) ? Array.from({ length: LOADING_PHRASES }, (_, i) => t(`loading.quip.${i + 1}`)) : void 0
  });
  try {
    return await analyzeFiles(rootUri, context, loading, fresh);
  } finally {
    loading.release();
  }
}
function reportIncompleteAnalysis(stats, root, isProjectRoot, leftOut) {
  const causes = likelyCauses({
    files: stats.files,
    withSymbols: stats.withSymbols,
    isProjectRoot,
    hasPackageConfig: fs19.existsSync(import_path8.default.join(root, ".dart_tool", "package_config.json")),
    dartExtensionActive: vscode29.extensions.getExtension("Dart-Code.dart-code")?.isActive === true,
    workspaceTrusted: vscode29.workspace.isTrusted,
    leftOutBySatori: leftOut
  });
  log.info(`\u26A0\uFE0F ${t("health.warning", String(stats.withSymbols), String(stats.files), String(stats.classes))}`);
  log.info(t("health.causesTitle"));
  causes.forEach((c) => log.info(`  - ${t("health.cause." + c.id, ...c.args)}`));
  const retry = t("health.action.retry");
  const details = t("health.action.details");
  void vscode29.window.showWarningMessage(t("health.warning", String(stats.withSymbols), String(stats.files), String(stats.classes)), retry, details).then((choice) => {
    if (choice === retry) {
      void vscode29.commands.executeCommand("satori.reanalyze");
    } else if (choice === details) {
      log.show();
    }
  });
}
var LOADING_PHRASES = 30;
var sleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
async function analyzeFiles(rootUri, context, loading, fresh) {
  const root = rootUri.fsPath;
  const isProjectRoot = fs19.existsSync(import_path8.default.join(root, "pubspec.yaml"));
  const analysisStart = Date.now();
  loading.start("files");
  const { uris: uniqueUris, leftOut } = await discoverDartFiles(rootUri, isProjectRoot);
  const discoveredAt = Date.now();
  loading.finish("files");
  if (uniqueUris.length === 0) {
    log.info("\u274C No Dart files found in the project.");
    vscode29.window.showWarningMessage("No Dart files found in the project. Please check your project structure.");
    return null;
  }
  log.debug(`\u{1F4C4} Sample of found files (first 5):`);
  uniqueUris.slice(0, 5).forEach((uri, idx) => {
    log.debug(`  ${idx + 1}. ${uri.fsPath}`);
  });
  const useCache = vscode29.workspace.getConfiguration("satori").get("cache.enabled", true);
  const extensionVersion = String(context.extension.packageJSON.version);
  const cacheFile = cacheFileFor(context.globalStorageUri.fsPath, normalizePath2(root));
  const architectureFile = findArchitectureFile(root);
  const stamps = stampFiles(uniqueUris.map((u) => u.fsPath));
  const fingerprint = fingerprintOf(stamps, [architectureDigest(architectureFile)]);
  const cached = useCache && !fresh ? readCachedAnalysis(cacheFile, fingerprint, extensionVersion) : null;
  if (cached) {
    const result = await createWebview(context, {
      projectRoot: normalizePath2(root),
      files: [],
      cached: { graph: cached.graph, fileImports: cached.fileImports },
      reporter: loading
    });
    const timings = {
      files: uniqueUris.length,
      discoverMs: discoveredAt - analysisStart,
      symbolsMs: 0,
      ...result.timings,
      totalMs: Date.now() - analysisStart
    };
    log.info("\u23F1 Opened " + timings.files + " files from the saved analysis in " + (timings.totalMs / 1e3).toFixed(1) + "s (saved " + new Date(cached.savedAt).toLocaleString() + "; turn off with satori.cache.enabled)");
    return { panel: result.panel, graph: result.graph, timings };
  }
  const stateFile = stateFileFor(cacheFile);
  let navigation;
  let filesDataArray;
  let symbolStats;
  let symbolsAt;
  let reusedImports;
  let incrementalNote;
  const previous = useCache && !fresh ? readState(stateFile, extensionVersion) : null;
  let incremental;
  if (previous) {
    try {
      incremental = await prepareIncremental({
        state: previous,
        uris: uniqueUris,
        stamps,
        extractSymbols: async (asked) => await extractFileSymbols(asked, loading, true),
        askNavigation: async (asked) => await buildNavigationIndex(root, uniqueUris, loading, asked)
      });
      if (!incremental.ok) {
        log.info(`Analysing everything again: ${incremental.reason}.`);
      }
    } catch (error) {
      log.info(`Analysing everything again: the incremental analysis failed (${error.message}).`);
    }
  }
  if (incremental && incremental.ok) {
    navigation = Promise.resolve(incremental.navigation);
    filesDataArray = incremental.files;
    symbolStats = incremental.stats;
    reusedImports = incremental.reusedImports;
    incrementalNote = `incremental: ${incremental.asked} files asked again, ${incremental.reused} reused`;
    loading.finish("symbols");
    loading.finish("relations");
    symbolsAt = Date.now();
  } else {
    navigation = buildNavigationIndex(root, uniqueUris, loading);
    let extraction = await extractFileSymbols(uniqueUris, loading, false);
    if (!symbolsLookComplete(extraction.stats)) {
      log.info(`Only ${extraction.stats.withSymbols} of ${extraction.stats.files} files returned symbols; waiting for the Dart server.`);
      let current = extraction.files;
      const waited = await waitForSymbols(extraction.stats, {
        delaysMs: DEFAULT_DELAYS_MS,
        stallLimit: 2,
        sleep,
        onWait: (round, delayMs, now) => {
          log.info(`Waiting ${delayMs / 1e3}s for the Dart server (round ${round}): ${now.withSymbols} of ${now.files} files have symbols.`);
          loading.progress("symbols", now.withSymbols, now.files, t("loading.symbols.waiting"));
        },
        round: async () => {
          const empty = new Set(current.filter((f) => f.symbols.length === 0).map((f) => f.fileUri));
          const again = await extractFileSymbols(uniqueUris.filter((u) => empty.has(u.toString())), loading, false);
          const byUri = new Map(again.files.map((f) => [f.fileUri, f]));
          current = current.map((f) => byUri.get(f.fileUri) ?? f);
          return { files: current.length, withSymbols: current.filter((f) => f.symbols.length > 0).length, errors: again.stats.errors };
        }
      });
      extraction = { files: current, stats: waited.stats };
      log.info(`Waited ${(waited.waitedMs / 1e3).toFixed(0)}s for the Dart server in ${waited.rounds} round(s): ${waited.stats.withSymbols} of ${waited.stats.files} files have symbols (${waited.end}).`);
    }
    loading.finish("symbols");
    filesDataArray = extraction.files;
    symbolStats = extraction.stats;
    symbolsAt = Date.now();
  }
  log.debug(`\u{1F4E6} Preparing to create webview...`);
  log.debug(`\u{1F4E6} Project root for webview: ${root}`);
  log.debug(`\u{1F4E6} Total files for webview: ${filesDataArray.length}`);
  let snapshot;
  try {
    log.debug(`\u{1F680} Calling createWebview function...`);
    const result = await createWebview(context, {
      projectRoot: normalizePath2(root),
      files: filesDataArray,
      reusedImports,
      // The symbols are copied now, before the graph is built (which changes them), and written once the page is up.
      onEnriched: useCache ? (enriched, imports) => {
        snapshot = { filesJson: JSON.stringify(enriched), imports: { ...imports } };
      } : void 0,
      navigation,
      reporter: loading
    });
    const { panel, graph } = result;
    const timings = {
      files: filesDataArray.length,
      discoverMs: discoveredAt - analysisStart,
      symbolsMs: symbolsAt - discoveredAt,
      ...result.timings,
      ...incrementalNote ? { engine: "incremental" } : {},
      totalMs: Date.now() - analysisStart
    };
    log.info(`\u23F1 Analysis of ${timings.files} files took ${(timings.totalMs / 1e3).toFixed(1)}s (find files ${timings.discoverMs}ms, symbols ${timings.symbolsMs}ms, wait for Dart server ${timings.relationsWaitMs}ms, enrichment ${timings.enrichMs}ms, graph ${timings.graphMs}ms, page ${timings.finishMs}ms)${incrementalNote ? "; " + incrementalNote : ""}`);
    const stats = { ...symbolStats, classes: (graph.nodes ?? []).filter((n) => n.kind === "class").length };
    if (isHealthy(stats)) {
      if (useCache) {
        setTimeout(async () => {
          try {
            writeCachedAnalysis(cacheFile, fingerprint, extensionVersion, graph, result.fileImports, stats);
            const used = (await navigation)?.index;
            if (snapshot) {
              writeStateParts(stateFile, { extensionVersion, stamps, hasNavigation: !!used }, snapshot.filesJson, snapshot.imports, used ? used.toJSON() : []);
            }
            log.info(`\u{1F4BE} Analysis saved for the next time (${cacheFile})`);
          } catch (e) {
            log.error(`Could not save the analysis: ${e.message}`);
          }
        }, 0);
      }
    } else {
      reportIncompleteAnalysis(stats, root, isProjectRoot, leftOut);
    }
    log.debug(`\u2705 Webview created successfully!`);
    log.debug(`\u{1F4CA} Graph stats: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);
    if (!graph.nodes || graph.nodes.length === 0) {
      log.error(`\u26A0\uFE0F WARNING: Graph has no nodes!`);
    }
    return { panel, graph, timings };
  } catch (error) {
    log.error(`\u274C CRITICAL ERROR creating webview:`);
    log.error(`   Message: ${error.message}`);
    log.error(`   Stack: ${error.stack}`);
    vscode29.window.showErrorMessage(`Failed to create visualization: ${error.message}`);
    return null;
  }
}
async function revealInEditor(file, start, end, preserveFocus = false) {
  try {
    const uri = vscode29.Uri.parse(file);
    const startPos = new vscode29.Position(start.line, start.character);
    const endPos = new vscode29.Position(end.line, end.character);
    const range = new vscode29.Range(startPos, endPos);
    const existingEditor = vscode29.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === uri.fsPath && e.viewColumn === vscode29.ViewColumn.Two
    );
    if (existingEditor) {
      existingEditor.selection = new vscode29.Selection(startPos, endPos);
      existingEditor.revealRange(range, vscode29.TextEditorRevealType.InCenter);
      return;
    }
    const doc = await vscode29.workspace.openTextDocument(uri);
    const editor = await vscode29.window.showTextDocument(doc, {
      viewColumn: vscode29.ViewColumn.Two,
      preview: true,
      preserveFocus,
      selection: range
    });
    editor.revealRange(range, vscode29.TextEditorRevealType.InCenter);
  } catch (e) {
    log.error(`Could not open or read file: ${file} (${e instanceof Error ? e.message : String(e)})`);
  }
}
function setupWebviewMessageHandlers(state, detailsProvider, context) {
  const panel = state.getPanel();
  const graph = state.getGraph();
  if (!panel || !graph) {
    log.error("Cannot setup webview handlers: panel or graph is undefined");
    return;
  }
  log.debug("Setting up webview message handlers...");
  log.debug(`\u{1F4CA} Graph stats for handlers: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);
  panel.webview.onDidReceiveMessage(
    async (message) => {
      const currentGraph = state.getGraph();
      const currentPanel = state.getPanel();
      switch (message.command) {
        case "log":
          log.debug(`[WebView] ${message.args.join(" ")}`);
          return;
        case "openClass":
          if (!message.file || !message.start || !message.end) {
            log.info(`Received openClass request without required file data.`);
            return;
          }
          await revealInEditor(message.file, message.start, message.end);
          return;
        case "ready":
          state.stats.webviewReady = true;
          return;
        case "reanalyze":
          void vscode29.commands.executeCommand("satori.reanalyze");
          return;
        case "setLayerOverride": {
          const folder = vscode29.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const start = state.projectRoot ?? folder;
          if (!start || typeof message.className !== "string") {
            return;
          }
          const result = writeLayerOverride(start, message.className, message.layer);
          if (!result.ok) {
            void vscode29.window.showWarningMessage(result.problem ?? "satori.json could not be changed.");
          } else if (result.created) {
            void vscode29.window.showInformationMessage(t("layer.fileCreated", import_path8.default.basename(result.file)));
          }
          return;
        }
        case "saveAnnotations":
          if (typeof message.projectRoot === "string" && message.data && typeof message.data === "object") {
            await saveAnnotations(context.workspaceState, message.projectRoot, message.data);
            state.stats.annotationSaves++;
          }
          return;
        case "getSnippet": {
          if (!currentGraph || !currentPanel) {
            return;
          }
          const snippet = buildSnippet(currentGraph, message);
          state.stats.snippetsServed++;
          currentPanel.webview.postMessage({ command: "snippet", requestId: message.requestId, snippet });
          if (snippet && message.reveal) {
            await revealInEditor(snippet.file, snippet.jump.start, snippet.jump.end, true);
          }
          return;
        }
        case "showRelationships":
          {
            state.stats.relationshipUpdates++;
            const data = message.data;
            if (data && currentGraph) {
              const focusedNode = currentGraph.nodes.find(
                (node) => node.label === data.focusedNodeLabel || node.id === data.focusedNodeId
              );
              detailsProvider.updateDetails({ ...data, focusedNode });
            } else {
              detailsProvider.updateDetails(data);
            }
          }
          return;
        case "getImports": {
          if (!message.nodeId || !currentGraph || !currentPanel) {
            return;
          }
          log.debug(`[Backend] WebView requested imports for:${message.nodeId}`);
          const focusNode = currentGraph.nodes.find((n) => n.id === message.nodeId);
          if (focusNode && focusNode.data.fileUri) {
            const imports = extractPackageImportsFromFile(focusNode.data.fileUri);
            log.debug(`[Backend] Imports found: ${imports.join(", ")}. Sending to WebView.`);
            currentPanel.webview.postMessage({
              command: "displayImports",
              nodeId: message.nodeId,
              imports
            });
          } else {
            log.debug(`[Backend] \u26A0\uFE0F Could not find node or its fileUri for ${message.nodeId}`);
          }
          return;
        }
        case "clearRelationships":
          detailsProvider.clearDetails();
          return;
      }
    },
    void 0,
    context.subscriptions
  );
  panel.onDidDispose(
    () => {
      log.debug("Graph panel closed, clearing details and state.");
      detailsProvider.clearDetails();
      state.clear();
    },
    null,
    context.subscriptions
  );
  log.debug("\u2705 Webview message handlers setup complete");
}
async function activate(context) {
  function getLanguage() {
    const config = vscode29.workspace.getConfiguration("satori");
    return config.get("language", "en");
  }
  log.debug("\u{1F680} Satori: starting\u2026");
  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);
  const dartExtension = vscode29.extensions.getExtension("Dart-Code.dart-code");
  if (!dartExtension || !dartExtension.isActive) {
    vscode29.window.showErrorMessage(
      "Dart extension is required for Satori to work properly."
    );
    return;
  }
  log.debug("Dart extension detected, using existing language services");
  registerDebugCommands(context);
  const state = new ExtensionState();
  const detailsProvider = new DetailsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode29.window.registerWebviewViewProvider(DetailsViewProvider.viewType, detailsProvider)
  );
  const runAnalysis = (rootUri, fresh = false) => vscode29.window.withProgress({
    location: vscode29.ProgressLocation.Notification,
    title: "Satori",
    cancellable: false
  }, async (progress) => {
    progress.report({ increment: 0, message: t("progress.starting") });
    const result = await analyzeProject(rootUri, context, progress, fresh);
    if (!result) {
      log.debug("Analysis returned NULL - ABORTING");
      vscode29.window.showErrorMessage("Analysis failed. Check the Output panel (Satori) for details.");
      return;
    }
    state.setGraph(result.panel, result.graph);
    state.timings = result.timings;
    state.projectRoot = rootUri.fsPath;
    setupWebviewMessageHandlers(state, detailsProvider, context);
    progress.report({ increment: 100, message: t("progress.completed") });
    log.debug("Analysis completed successfully");
  });
  const analyzeCurrentProjectCommand = vscode29.commands.registerCommand(
    "satori.analyzeProject",
    async () => {
      const rootUri = await findFlutterProjectRoot();
      if (!rootUri) {
        log.debug("No Flutter project root found - ABORTING");
        return;
      }
      await runAnalysis(rootUri);
    }
  );
  log.info("Command satori.analyzeProject registered");
  context.subscriptions.push(analyzeCurrentProjectCommand);
  context.subscriptions.push(vscode29.commands.registerCommand("satori.reanalyze", async () => {
    const rootUri = await findFlutterProjectRoot();
    if (!rootUri) {
      return;
    }
    await runAnalysis(rootUri, true);
  }));
  context.subscriptions.push(vscode29.commands.registerCommand("satori.clearCache", () => {
    const removed = clearCachedAnalyses(context.globalStorageUri.fsPath);
    log.info(`Saved analyses removed: ${removed}`);
    void vscode29.window.showInformationMessage(t("cache.cleared", String(removed)));
  }));
  const showProjectDiagramCommand = vscode29.commands.registerCommand(
    "extension.showProjectDiagram",
    async () => {
      const pick = await vscode29.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select project folder"
      });
      if (!pick?.length) {
        log.debug("No folder selected - ABORTING");
        return;
      }
      await runAnalysis(pick[0]);
    }
  );
  log.info("Command extension.showProjectDiagram registered");
  context.subscriptions.push(showProjectDiagramCommand);
  const originalResolveWebviewView = detailsProvider.resolveWebviewView.bind(detailsProvider);
  detailsProvider.resolveWebviewView = (webviewView, ...args) => {
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "log":
          log.debug(`[DetailsView] ${message.args.join(" ")}`);
          break;
        case "focusNode":
          const currentPanel = state.getPanel();
          if (currentPanel) {
            log.debug(`[Extension] Received 'focusNode' from DetailsView. Forwarding to graph.`);
            currentPanel.webview.postMessage({
              command: "setFocusInGraph",
              nodeId: message.nodeId
            });
          } else {
            log.debug(`[Extension] Error: Received 'focusNode' but graph panel is not open.`);
          }
          break;
        case "highlightPath":
          const panelForPath = state.getPanel();
          if (panelForPath) {
            log.debug(`[Extension] Forwarding 'highlightPath' to graph.`);
            panelForPath.webview.postMessage({
              command: "setPathHighlight",
              sourceId: message.sourceId,
              targetId: message.targetId
            });
          }
          break;
        case "openFile": {
          const currentGraph = state.getGraph();
          if (!message.nodeId || !currentGraph) {
            log.info(`Received openFile request without nodeId or graph not loaded.`);
            return;
          }
          const node = currentGraph.nodes.find((n) => n.id === message.nodeId);
          if (!node || !node.data.fileUri) {
            log.error(`Could not find node or file URI for id: ${message.nodeId}`);
            return;
          }
          try {
            const uri = vscode29.Uri.parse(node.data.fileUri);
            const doc = await vscode29.workspace.openTextDocument(uri);
            await vscode29.window.showTextDocument(doc, {
              viewColumn: vscode29.ViewColumn.Two,
              preview: false,
              preserveFocus: false
            });
            log.debug(`Successfully opened file: ${node.data.fileUri}`);
          } catch (error) {
            log.error(`Error opening file ${node.data.fileUri}: ${error}`);
            vscode29.window.showErrorMessage(`Could not open file: ${node.label}`);
          }
          return;
        }
      }
    });
    return originalResolveWebviewView(webviewView, ...args);
  };
  return {
    getGraph: () => state.getGraph(),
    getStats: () => ({ ...state.stats, timings: state.timings }),
    focusNode: (nodeId) => state.getPanel()?.webview.postMessage({ command: "setFocusInGraph", nodeId })
  };
}
function normalizePath2(p) {
  return p.replace(/\\/g, "/");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
//# sourceMappingURL=extension.js.map
