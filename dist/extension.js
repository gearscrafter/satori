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
var vscode22 = __toESM(require("vscode"));
var import_path7 = __toESM(require("path"));
var fs10 = __toESM(require("fs"));

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
      if (!entry.isDirectory()) continue;
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

// src/core/constants.ts
var vscode6 = __toESM(require("vscode"));
var KIND_CLASS = vscode6.SymbolKind.Class;
var KIND_ENUM = vscode6.SymbolKind.Enum;
var KIND_METHOD = vscode6.SymbolKind.Method;
var KIND_FUNCTION = vscode6.SymbolKind.Function;
var KIND_CONSTRUCTOR = vscode6.SymbolKind.Constructor;
var KIND_FIELD = vscode6.SymbolKind.Field;
var KIND_PROPERTY = vscode6.SymbolKind.Property;
var KIND_EXTENSION = vscode6.SymbolKind.Namespace;
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
  if (!typeString) return void 0;
  let currentType = typeString.trim().replace(/\?$/, "");
  const genericMatch = currentType.match(/^[\w\s]+\s*<(.+)>$/);
  if (genericMatch?.[1]) {
    const innerType = parseBaseTypeName(genericMatch[1]);
    if (innerType) return innerType;
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
function calculateDataFlow(graph, startNodeId) {
  const path12 = [startNodeId];
  const visited = /* @__PURE__ */ new Set([startNodeId]);
  let currentNodeId = startNodeId;
  for (let i = 0; i < 10; i++) {
    const writerEdge = graph.edges.find((e) => e.target === currentNodeId && e.label === "WRITES_TO" && !visited.has(e.source));
    if (writerEdge) {
      path12.unshift(writerEdge.source);
      visited.add(writerEdge.source);
      currentNodeId = writerEdge.source;
    } else {
      break;
    }
  }
  currentNodeId = startNodeId;
  for (let i = 0; i < 10; i++) {
    const readerEdge = graph.edges.find((e) => e.source === currentNodeId && e.label === "READS_FROM" && !visited.has(e.target));
    if (readerEdge) {
      path12.push(readerEdge.target);
      visited.add(readerEdge.target);
      currentNodeId = readerEdge.target;
    } else {
      break;
    }
  }
  return path12;
}

// src/packages/package_files.ts
var fs5 = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var vscode7 = __toESM(require("vscode"));
function findDartFilesInPackage(libPath, maxFiles = 20) {
  const dartFiles = [];
  try {
    let searchRecursive2 = function(currentPath, depth = 0) {
      if (depth > 3 || dartFiles.length >= maxFiles) return;
      const entries = fs5.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (dartFiles.length >= maxFiles) break;
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
    const filePath = vscode7.Uri.parse(fileUri).fsPath;
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
var vscode20 = __toESM(require("vscode"));
var fs9 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));

// src/analysis/validation.ts
function validateEnrichedData(enrichedFiles) {
  const symbolMap = /* @__PURE__ */ new Map();
  function recurse(symbols) {
    for (const sym of symbols) {
      if (sym.uniqueId) {
        symbolMap.set(sym.uniqueId, sym);
      }
      if (sym.kind === 5) {
        log.debug(`[VALIDATE] Class: ${sym.name}`);
      }
      if (sym.kind === 9) {
        if (!sym.parameters && sym.detail) {
          log.debug(`[WARN] Constructor '${sym.name}' has detail but no parameters were extracted.`);
        }
        if (sym.parentId) {
          const parent = symbolMap.get(sym.parentId);
          if (!parent) {
            log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
          } else {
            if (parent.kind !== 5) {
              log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not a class (kind !== 5)`);
            }
            if (Array.isArray(sym.parameters) && Array.isArray(parent.children)) {
              const parentFields = new Set(parent.children.map((c) => c.name));
              for (const param of sym.parameters) {
                if (param.name && !parentFields.has(param.name)) {
                  log.debug(`[WARN] Constructor '${sym.name}' has parameter '${param.name}' that is not found as property in '${parent.name}'`);
                }
              }
            }
          }
        }
      }
      if (sym.parentId && !symbolMap.has(sym.parentId)) {
        log.debug(`[ERROR] parentId '${sym.parentId}' of '${sym.name}' is not among the uniqueIds.`);
      }
      if (sym.children) recurse(sym.children);
    }
  }
  try {
    for (const file of enrichedFiles) {
      recurse(file.symbols);
    }
  } catch (err) {
    log.error(`Error running validateEnrichedData:, ${err}`);
  }
}

// src/graph/graph_builder.ts
var vscode14 = __toESM(require("vscode"));

// src/graph/layer_classifier.ts
var vscode8 = __toESM(require("vscode"));
function getArchitecturalLayer(symbol, relations) {
  if (symbol.kind !== vscode8.SymbolKind.Class && symbol.kind !== vscode8.SymbolKind.Enum) {
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
  if (symbol.kind === vscode8.SymbolKind.Class && symbol.children) {
    const hasBuildMethod = symbol.children.some(
      (c) => c.kind === vscode8.SymbolKind.Method && c.name === "build"
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
  if (allRelations.includes("changenotifier") || allRelations.includes("statenotifier") || allRelations.includes("bloc") || allRelations.includes("cubit") || allRelations.includes("provider") || allRelations.includes("controller")) {
    return "state";
  }
  if (symbol.kind === vscode8.SymbolKind.Class && symbol.children) {
    const hasStateStream = symbol.children.some(
      (c) => (c.kind === vscode8.SymbolKind.Field || c.kind === vscode8.SymbolKind.Property) && (c.name === "stream" || c.name === "state")
    );
    const hasEventMethod = symbol.children.some(
      (c) => c.kind === vscode8.SymbolKind.Method && (c.name === "add" || c.name === "emit" || c.name === "on")
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
  if (symbol.kind === vscode8.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode8.SymbolKind.Method);
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
  if (symbol.kind === vscode8.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode8.SymbolKind.Method);
    const fields = symbol.children.filter(
      (c) => c.kind === vscode8.SymbolKind.Field || c.kind === vscode8.SymbolKind.Property
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
  if (symbol.kind === vscode8.SymbolKind.Enum) {
    return "model";
  }
  if (name.endsWith("util") || name.endsWith("utils") || name.endsWith("helper") || name.endsWith("extension") || name.endsWith("mixin") || name.endsWith("constants") || name.endsWith("config") || name.endsWith("settings")) {
    return "utility";
  }
  if (symbol.kind === vscode8.SymbolKind.Class && symbol.children) {
    const methods = symbol.children.filter((c) => c.kind === vscode8.SymbolKind.Method);
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
    if (!symbols) return;
    for (const s of symbols) {
      s.fileUri = s.fileUri || fileUri;
      const nodeId = generateGlobalSymbolId2(s, parentClass?.name);
      const parentId = parentClass ? generateGlobalSymbolId2(parentClass, void 0) : void 0;
      if (parentClass) {
        log.debug(`[DEBUG-PARENT] ${s.name} has parent${parentClass.name}`);
        log.debug(`[DEBUG-PARENT-ID] ${s.name} \u2192 parentId: ${parentId}`);
      } else {
        log.debug(`[DEBUG-PARENT] ${s.name} has no parent (is top-level)`);
      }
      if (!generatedNodeIds.has(nodeId)) {
        generatedNodeIds.add(nodeId);
        const layer = getArchitecturalLayer(s, s.relations);
        log.debug(`[DEBUG-RECURSIVE-PARENT] Processing: ${s.name}, parentClass: ${parentClass?.name ?? "none"}`);
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
            layer
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
var vscode9 = __toESM(require("vscode"));
var fs6 = __toESM(require("fs"));
function getSourceCodeForSymbol(symbol) {
  const rangeToUse = symbol.range || symbol.selectionRange;
  if (!rangeToUse || !symbol.fileUri) return "";
  try {
    const filePath = vscode9.Uri.parse(symbol.fileUri).fsPath;
    const fileContent = fs6.readFileSync(filePath, "utf8");
    const lines = fileContent.split(/\r?\n/);
    const start = rangeToUse.start;
    const end = rangeToUse.end;
    if (start.line >= lines.length || end.line >= lines.length) return "";
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

// src/lsp/reference_analysis.ts
var vscode10 = __toESM(require("vscode"));
async function tryAddReadsFromEdge(projectGraph, sourceNode, targetNode, targetSymbol, sourceCodeText, createEdge) {
  const cleanedSource = stripCommentsAndStrings(sourceCodeText);
  try {
    const references = await vscode10.commands.executeCommand(
      "vscode.executeReferenceProvider",
      vscode10.Uri.parse(targetSymbol.fileUri),
      targetSymbol.selectionRange.start
    );
    if (references && references.length > 0) {
      log.debug(`[LSP] \u2705 Found  ${references.length} references for '${targetSymbol.name}'`);
      for (const ref of references) {
        const refLsp = {
          uri: ref.uri.toString(),
          range: ref.range
        };
        const container = findEnclosingFunctionOrMethodNode(projectGraph.nodes, refLsp);
        if (container) {
          log.debug(`[LSP] Reference found within function: ${container.label}`);
        }
        if (container && container.id === sourceNode.id) {
          log.debug(`[LSP] \u{1F3AF} READS_FROM: '${sourceNode.label}' \u2192 '${targetNode.label}'`);
          createEdge(sourceNode.id, targetNode.id, "READS_FROM");
          return;
        }
      }
      log.debug(`[LSP] \u{1F9ED} No reference found within container '${sourceNode.label}'`);
    } else {
      log.debug(`[LSP] \u274C No references found for  '${targetSymbol.name}'`);
    }
  } catch (err) {
    log.error(`[GraphBuilder] \u26A0\uFE0F LSP fallback for '${targetSymbol.name}'`);
  }
}
function findEnclosingFunctionOrMethodNode(nodes, ref) {
  const nodesInFile = nodes.filter((n) => n.data.fileUri === ref.uri);
  const pos = ref.range.start;
  return nodesInFile.find((n) => {
    const range = n.data.range;
    return (n.kind === "method" || n.kind === "function") && range !== void 0 && range.start.line <= pos.line && range.end.line >= pos.line;
  });
}

// src/packages/package_discovery.ts
var import_path3 = __toESM(require("path"));
var vscode11 = __toESM(require("vscode"));
var fs8 = __toESM(require("fs"));

// src/packages/package_analyzer.ts
var fs7 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
function analyzeExternalPackage(packageName, packagePath, rawData, projectRootPath) {
  log.debug(` -> Analyzing details of package '${packageName}'...`);
  if (!fs7.existsSync(packagePath)) {
    log.debug(`    -> ERROR: Package path does not exist: ${packagePath}`);
    return null;
  }
  try {
    const packageInfo = {
      name: packageName,
      path: packagePath,
      version: rawData.version || "unknown",
      type: determinePackageType(packageName, packagePath, projectRootPath),
      dartFiles: [],
      hasLibFolder: false,
      isFlutterPackage: false,
      description: ""
    };
    log.debug(`    -> Classified as: '${packageInfo.type}'`);
    const libPath = import_path2.default.join(packagePath, "lib");
    packageInfo.hasLibFolder = fs7.existsSync(libPath);
    const packagePubspecPath = import_path2.default.join(packagePath, "pubspec.yaml");
    if (fs7.existsSync(packagePubspecPath)) {
      try {
        const pubspecContent = fs7.readFileSync(packagePubspecPath, "utf8");
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
function determinePackageType(packageName, packagePath, projectRootPath) {
  let actualProjectRoot = projectRootPath || null;
  if (!actualProjectRoot) {
    actualProjectRoot = findProjectRootWithPubspec(packagePath) || findProjectRootWithPubspec(process.cwd());
  }
  if (actualProjectRoot && packagePath.startsWith(actualProjectRoot)) {
    return "custom";
  }
  if (actualProjectRoot) {
    try {
      const mainPubspecPath = import_path2.default.join(actualProjectRoot, "pubspec.yaml");
      if (fs7.existsSync(mainPubspecPath)) {
        const pubspecContent = fs7.readFileSync(mainPubspecPath, "utf8");
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
  const packageConfigPath = import_path3.default.join(projectRoot, ".dart_tool", "package_config.json");
  if (!fs8.existsSync(packageConfigPath)) {
    log.debug(`\u26A0\uFE0F [Debug].dart_tool/package_config.json file not found. Cannot determine packages.`);
    return allPackages;
  }
  log.debug(`[Debug] Analyzing ${packageConfigPath}...`);
  try {
    const packageConfig = JSON.parse(fs8.readFileSync(packageConfigPath, "utf8"));
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
          packagePath = vscode11.Uri.parse(pkg.rootUri).fsPath;
        } else {
          const dartToolDir = import_path3.default.dirname(packageConfigPath);
          packagePath = import_path3.default.resolve(dartToolDir, pkg.rootUri);
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
var vscode12 = __toESM(require("vscode"));
function createPackageContainerNodes(externalPackages, projectGraph, generatedNodeIds) {
  log.debug(`[PackageContainers] Creating container nodes for${externalPackages.length} paquetes...`);
  for (const pkg of externalPackages) {
    const containerNodeId = `package_container:${pkg.name}`;
    if (!generatedNodeIds.has(containerNodeId)) {
      generatedNodeIds.add(containerNodeId);
      const fakeRange = new vscode12.Range(
        new vscode12.Position(0, 0),
        new vscode12.Position(0, pkg.name.length)
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
  const packageContainerMap = /* @__PURE__ */ new Map();
  for (const pkg of externalPackages) {
    packageContainerMap.set(pkg.name, `package_container:${pkg.name}`);
  }
  let interPackageEdges = 0;
  for (const edge of projectGraph.edges) {
    const sourceNode = projectGraph.nodes.find((n) => n.id === edge.source);
    const targetNode = projectGraph.nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;
    const sourcePackage = sourceNode.data.source?.packageName;
    const targetPackage = targetNode.data.source?.packageName;
    if (sourcePackage && targetPackage && sourcePackage !== targetPackage) {
      const sourceContainerId = packageContainerMap.get(sourcePackage);
      const targetContainerId = packageContainerMap.get(targetPackage);
      if (sourceContainerId && targetContainerId) {
        createEdge(sourceContainerId, targetContainerId, "USES_AS_TYPE");
        interPackageEdges++;
        log.debug(`   Dependency: ${sourcePackage} \u2192 ${targetPackage}`);
      }
    }
    if (!sourcePackage && targetPackage) {
      const targetContainerId = packageContainerMap.get(targetPackage);
      if (targetContainerId) {
        const projectContainerId = "project_root";
        createEdge(projectContainerId, targetContainerId, "USES_AS_TYPE");
      }
    }
  }
  log.debug(`  \u2705 ${interPackageEdges} inter-package dependencies created`);
}

// src/packages/source_detector.ts
var import_path4 = __toESM(require("path"));
var vscode13 = __toESM(require("vscode"));
function determineFileSource(fileUri, allPackages) {
  try {
    if (!fileUri) return { type: "project" };
    const filePath = vscode13.Uri.parse(fileUri).fsPath;
    if (filePath.includes("dart-sdk/lib") || filePath.includes("flutter/bin/cache/dart-sdk")) {
      return { type: "sdk", packageType: "sdk" };
    }
    const normalizedFilePath = import_path4.default.normalize(filePath);
    for (const pkg of allPackages) {
      const normalizedPkgPath = import_path4.default.normalize(pkg.path);
      if (normalizedFilePath.startsWith(normalizedPkgPath)) {
        return {
          type: pkg.type === "custom" ? "project" : "external_package",
          packageName: pkg.name,
          packageVersion: pkg.version,
          packageType: pkg.type,
          relativePath: import_path4.default.relative(pkg.path, filePath)
        };
      }
    }
    return { type: "project" };
  } catch (error) {
    log.error(`\u274C ERROR in determineFileSource when processing URI: "${fileUri}"`);
    if (error instanceof Error) log.error(`   -> Message:${error.message}`);
    return { type: "project" };
  }
}

// src/packages/graph_integration/node_assignment.ts
function assignNodesToPackageContainers(projectGraph, externalPackages) {
  log.debug(`[PackageAssignment] Assigning nodes to package containers...`);
  let assignedCount = 0;
  let projectNodesCount = 0;
  for (const node of projectGraph.nodes) {
    if (node.kind === "package_container") continue;
    const fileSource = determineFileSource(node.data.fileUri, externalPackages);
    node.data.source = fileSource;
    if (fileSource.type === "external_package" && fileSource.packageName) {
      const containerNodeId = `package_container:${fileSource.packageName}`;
      node.parent = containerNodeId;
      assignedCount++;
      node.label = `\u{1F517} ${node.label}`;
      log.debug(`    \u{1F4E6} ${node.label} \u2192 ${fileSource.packageName}`);
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
async function integrateExternalPackages(projectGraph, projectRoot, generatedNodeIds, createEdge) {
  log.debug(`[ExternalPackages] \u{1F50D} Integrating external packages..`);
  const externalPackages = findAllPackages(projectRoot);
  if (externalPackages.length === 0) {
    log.debug(`[ExternalPackages] No relevant external packages found`);
    return;
  }
  createPackageContainerNodes(externalPackages, projectGraph, generatedNodeIds);
  assignNodesToPackageContainers(projectGraph, externalPackages);
  createInterPackageDependencyEdges(projectGraph, externalPackages, createEdge);
  log.debug(`[ExternalPackages] \u2705 External package integration completed`);
}

// src/graph/edge_creator.ts
async function createGraphEdgesFromSymbols(projectGraph, symbolMapById, createEdge, projectRoot, generatedNodeIds) {
  log.debug(`[GraphBuilder] Creating edges...`);
  if (projectRoot && generatedNodeIds) {
    log.debug(`[GraphBuilder] Integrating external packages...`);
    const nodesBefore = projectGraph.nodes.length;
    await integrateExternalPackages(
      projectGraph,
      projectRoot,
      generatedNodeIds,
      createEdge
    );
    const nodesAfter = projectGraph.nodes.length;
    log.debug(`Package containers created: ${nodesAfter - nodesBefore}`);
  }
  const symbolNameIndex = /* @__PURE__ */ new Map();
  for (const enriched of symbolMapById.values()) {
    const name = enriched.name;
    if (!symbolNameIndex.has(name)) {
      symbolNameIndex.set(name, []);
    }
    symbolNameIndex.get(name).push(enriched);
  }
  for (const sourceNode of projectGraph.nodes) {
    const sourceSymbol = symbolMapById.get(sourceNode.id);
    if (!sourceSymbol) {
      log.debug(`\u26A0\uFE0F Node without symbol: ${sourceNode.id}`);
      continue;
    }
    if (sourceSymbol.relations) {
      log.debug(`[DEBUG] ${sourceSymbol.name} relations: ${JSON.stringify(sourceSymbol.relations)}`);
      const findClassNodeByName = (name) => {
        const baseName = name.split("<")[0].trim();
        return projectGraph.nodes.find((n) => n.kind === "class" && n.label === baseName);
      };
      sourceSymbol.relations.extends?.forEach((ext) => {
        const parentName = typeof ext === "string" ? ext : ext.name;
        const targetNode = findClassNodeByName(parentName);
        if (targetNode) createEdge(sourceNode.id, targetNode.id, "EXTENDS");
      });
      sourceSymbol.relations.implements?.forEach((impl) => {
        const interfaceName = typeof impl === "string" ? impl : impl.name;
        const targetNode = findClassNodeByName(interfaceName);
        if (targetNode) createEdge(sourceNode.id, targetNode.id, "IMPLEMENTS");
      });
    }
    if (sourceNode.kind === "method" || sourceNode.kind === "function" || sourceNode.kind === "constructor") {
      const sourceCodeText = getSourceCodeForSymbol(sourceSymbol);
      if (!sourceCodeText) return;
      log.debug(`[DEBUG] ${sourceSymbol.name} - sourceCodeText length: ${sourceCodeText?.length}`);
      const cleanedSource = stripCommentsAndStrings(sourceCodeText);
      const mentionedNames = Array.from(symbolNameIndex.keys()).filter((name) => {
        const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`);
        return callPattern.test(cleanedSource);
      });
      log.debug(`[DEBUG] ${sourceSymbol.name} mentions: ${mentionedNames.join(", ")}`);
      for (const targetName of mentionedNames) {
        const targetSymbols = symbolNameIndex.get(targetName);
        for (const targetSymbol of targetSymbols) {
          const targetNode = projectGraph.nodes.find(
            (n) => symbolMapById.get(n.id) === targetSymbol
          );
          if (!targetNode || sourceNode.id === targetNode.id) continue;
          if (targetNode.kind === "method" || targetNode.kind === "function") {
            createEdge(sourceNode.id, targetNode.id, "CALLS");
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
  ;
}

// src/graph/graph_builder.ts
var import_path5 = __toESM(require("path"));
async function buildGraphModel(enrichedFiles, projectRoot) {
  const projectGraph = { nodes: [], edges: [] };
  const generatedNodeIds = /* @__PURE__ */ new Set();
  const symbolMapById = /* @__PURE__ */ new Map();
  let edgeIdCounter = 0;
  const edgeCounts = {};
  const createEdge = (sourceId, targetId, label) => {
    if (sourceId && targetId && sourceId !== targetId && generatedNodeIds.has(sourceId) && generatedNodeIds.has(targetId)) {
      const edgeExists = projectGraph.edges.some((e) => e.source === sourceId && e.target === targetId && e.label === label);
      if (!edgeExists) {
        projectGraph.edges.push({ id: `e${edgeIdCounter++}`, source: sourceId, target: targetId, label });
        if (label) {
          edgeCounts[label] = (edgeCounts[label] || 0) + 1;
        }
      }
    }
  };
  log.debug(`[GraphBuilder] Creating nodes...`);
  createGraphNodesFromSymbols(enrichedFiles, projectGraph, symbolMapById, generateGlobalSymbolId, generatedNodeIds);
  log.debug(`  -> ${projectGraph.nodes.length} nodes created.`);
  log.debug(`[GraphBuilder] \u{1F50D} Validating constructors and detail...`);
  log.debug(`[GraphBuilder] Creating edges...`);
  if (projectRoot) {
    log.debug(`[GraphBuilder] Extracting symbols from external packages...`);
    const externalSymbols = await extractSymbolsFromExternalPackages(projectRoot);
    for (const [id, symbol] of externalSymbols) {
      symbolMapById.set(id, symbol);
    }
    if (externalSymbols.size > 0) {
      const externalFileData = [{
        fileUri: "external_packages",
        symbols: Array.from(externalSymbols.values())
      }];
      createGraphNodesFromSymbols(
        externalFileData,
        projectGraph,
        symbolMapById,
        generateGlobalSymbolId,
        generatedNodeIds
      );
      log.debug(`-> ${externalSymbols.size} external symbols added`);
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
  await createGraphEdgesFromSymbols(projectGraph, symbolMapById, createEdge, projectRoot, generatedNodeIds);
  log.debug(`[GraphBuilder] Edge Breakdown:: ${JSON.stringify(edgeCounts)}`);
  log.debug(`  -> Final total of edges: ${projectGraph.edges.length}`);
  if (projectRoot) {
    log.debug(`[GraphBuilder] \u{1F4E6} Integrating external packages...`);
    const nodesBefore = projectGraph.nodes.length;
    await integrateExternalPackages(
      projectGraph,
      projectRoot,
      generatedNodeIds,
      createEdge
    );
    const nodesAfter = projectGraph.nodes.length;
    const packageContainers = projectGraph.nodes.filter((n) => n.kind === "package_container");
    log.debug(`[GraphBuilder] \u2705 External packages integrated:`);
    log.debug(`    \u2022 Nodes before: ${nodesBefore}, despu\xE9s: ${nodesAfter}`);
    log.debug(`    \u2022 Package containers created: ${packageContainers.length}`);
    log.debug(`    \u2022 Names: ${packageContainers.map((p) => p.label).join(", ")}`);
    if (packageContainers.length > 0) {
      log.debug(`  \u2022 Package containers found:`);
      packageContainers.forEach((node) => {
        log.debug(`    - ${node.label} (${node.data.source?.packageType || "unknown"})`);
      });
    } else {
      log.debug(`  \u274C NO PACKAGE CONTAINERS FOUND - ISSUE IN EXTENSION`);
    }
    log.debug(`[GraphBuilder] \u2705 External packages integrated. Final nodes: ${projectGraph.nodes.length}, Aristas finales: ${projectGraph.edges.length}`);
  }
  return projectGraph;
}
function getRelevantExternalPackages(packages) {
  return packages.filter(
    (pkg) => pkg.type === "third_party" || pkg.type === "custom" || pkg.type === "flutter_official" && !["flutter", "flutter_test"].includes(pkg.name)
  );
}
async function extractSymbolsFromExternalPackages(projectRoot) {
  const externalSymbols = /* @__PURE__ */ new Map();
  const allPackages = findAllPackages(projectRoot);
  const relevantPackages = getRelevantExternalPackages(allPackages);
  for (const pkg of relevantPackages) {
    if (!pkg.hasLibFolder || pkg.dartFiles.length === 0) continue;
    const mainFiles = pkg.dartFiles.filter((file) => {
      const fileName = import_path5.default.basename(file, ".dart");
      return fileName === pkg.name || fileName === "main" || file.endsWith(`lib/${pkg.name}.dart`);
    }).slice(0, 1);
    for (const dartFile of mainFiles) {
      try {
        const fileUri = vscode14.Uri.file(dartFile);
        const symbols = await vscode14.commands.executeCommand(
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
var vscode19 = __toESM(require("vscode"));

// src/analysis/enrichment/basic_enrichment.ts
var vscode15 = __toESM(require("vscode"));
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
  if (enrichedSym.kind === vscode15.SymbolKind.Class) {
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
var vscode17 = __toESM(require("vscode"));

// src/analysis/enrichment/type-resolver.ts
var vscode16 = __toESM(require("vscode"));
async function resolveTypeByName(typeName, dependencies) {
  const { allProjectFilesData } = dependencies;
  const baseTypeName = parseBaseTypeName(typeName);
  if (!baseTypeName) return void 0;
  if (resolvedTypesCache.has(typeName)) {
    log.debug(`\u{1F9E0} [Cache HIT] ${typeName}`);
    return resolvedTypesCache.get(typeName);
  }
  for (const file of allProjectFilesData) {
    for (const symbol of file.symbols) {
      if ((symbol.kind === vscode16.SymbolKind.Class || symbol.kind === vscode16.SymbolKind.Enum || symbol.kind === 22) && symbol.name === baseTypeName) {
        const result = {
          name: typeName,
          definition: {
            name: symbol.name,
            kind: symbol.kind,
            fileUri: symbol.fileUri,
            selectionRange: symbol.selectionRange,
            isSDK: !!symbol.isSDK
          }
        };
        resolvedTypesCache.set(typeName, result);
        log.debug(`\u{1F4E6} [Cache SET] ${typeName}`);
        return result;
      }
    }
  }
  const fallbackResult = { name: typeName };
  resolvedTypesCache.set(typeName, fallbackResult);
  return fallbackResult;
}

// src/analysis/enrichment/detail_enrichment.ts
async function enrichWithTypesFromDetail(enrichedSym, logPrefix, dependencies) {
  const symbol = enrichedSym;
  if (!symbol.detail || typeof symbol.detail !== "string") return;
  log.debug(`[DEBUG-ENRICH-DETAIL] Enriching ${symbol.name}, detail: ${symbol.detail}`);
  log.debug(`${logPrefix}  [DEBUG] symbol.kind: ${symbol.kind}, symbol.detail: ${symbol.detail}`);
  log.debug(`${logPrefix}  [Type Detail] Analyzing detail: "${symbol.detail}"`);
  if ((symbol.kind === vscode17.SymbolKind.Field || symbol.kind === vscode17.SymbolKind.Property) && !enrichedSym.resolvedType) {
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
            if (remaining === "") return parsedParams;
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
    if (symbol.kind !== vscode17.SymbolKind.Constructor && !enrichedSym.returnType) {
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
  if (symbol.kind === vscode17.SymbolKind.Constructor && enrichedSym.parameters?.length === 0 && /^\s*\(\s*\{\s*this\.[\w$]+/.test(symbol.detail)) {
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
  const lines = fileContent.split("\n");
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
      }
    }
  }
  if (!match) {
    log.debug(`${logPrefix}  DEBUG_F: Regex found no match for '${enrichedSym.name}'`);
  }
}

// src/lsp/hover_enrichment.ts
var vscode18 = __toESM(require("vscode"));
async function enrichWithHoverTypes(enrichedSym, logPrefix, dependencies) {
  const needsTypeInfo = (enrichedSym.kind === vscode18.SymbolKind.Field || enrichedSym.kind === vscode18.SymbolKind.Property) && !enrichedSym.resolvedType || (enrichedSym.kind === vscode18.SymbolKind.Method || enrichedSym.kind === vscode18.SymbolKind.Function) && !enrichedSym.returnType || enrichedSym.kind === vscode18.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0);
  if (!enrichedSym.fileUri || !enrichedSym.selectionRange || !needsTypeInfo) {
    log.debug(`${logPrefix}  \u26A0\uFE0F Skipped enrichHover for '${enrichedSym.name}' (kind: ${enrichedSym.kind}) \u2192 needsTypeInfo: ${needsTypeInfo}`);
    return;
  }
  if (enrichedSym.hoverChecked) return;
  enrichedSym.hoverChecked = true;
  const escapedSymName = escapeRegExp(enrichedSym.name);
  try {
    const hoverResultArray = await vscode18.commands.executeCommand(
      "vscode.executeHoverProvider",
      vscode18.Uri.parse(enrichedSym.fileUri),
      enrichedSym.selectionRange.start
    );
    const hoverResult = hoverResultArray && hoverResultArray.length > 0 ? hoverResultArray[0] : null;
    if (!hoverResult?.contents?.length) {
      return;
    }
    log.debug(`${logPrefix}  \u{1F9EA} Checking if '${enrichedSym.name}' is constructor`);
    log.debug(`${logPrefix}     \u2192 kind: ${enrichedSym.kind} (${vscode18.SymbolKind[enrichedSym.kind]})`);
    log.debug(`${logPrefix}     \u2192 parameters: ${enrichedSym.parameters?.length ?? "undefined"}`);
    const contentString = hoverResult.contents.map(
      (content) => typeof content === "string" ? content : content.value
    ).join("\n");
    if ((enrichedSym.kind === vscode18.SymbolKind.Field || enrichedSym.kind === vscode18.SymbolKind.Property) && !enrichedSym.resolvedType) {
      const fieldRegex = new RegExp("```dart\\s*(?:[\\w\\s]+\\s)?(.+?)\\s+" + escapedSymName);
      const match = contentString.match(fieldRegex);
      if (match && match[1]) {
        enrichedSym.resolvedType = match[1].trim();
        log.debug(`${logPrefix}  \u21B3 Hover: Field '${enrichedSym.name}' resolved type: ${enrichedSym.resolvedType}`);
      }
    } else if ((enrichedSym.kind === vscode18.SymbolKind.Method || enrichedSym.kind === vscode18.SymbolKind.Function) && !enrichedSym.returnType) {
      const methodRegex = new RegExp("```dart\\s*(?:static\\s+)?(.+?)\\s+(?:get\\s+)?[\"'`]?" + escapedSymName + "[\"'`]?s*\\(");
      const match = contentString.match(methodRegex);
      if (match && match[1]) {
        const returnType = match[1].trim();
        if (returnType.toLowerCase() !== "void") {
          enrichedSym.returnType = returnType;
          log.debug(`${logPrefix}  \u21B3 Hover: Method '${enrichedSym.name}' return type: ${enrichedSym.returnType}`);
        }
      }
    } else if (enrichedSym.kind === vscode18.SymbolKind.Constructor && (!enrichedSym.parameters || enrichedSym.parameters.length === 0)) {
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
  } catch (e) {
    log.error(`${logPrefix}  \u26A0\uFE0F Error in Hover for ${enrichedSym.name}: ${e.message}`);
  }
}

// src/analysis/symbol_processor.ts
async function processSymbolRecursiveLSP(symbolToProcess, currentFileUri, dependencies, depth = 0, parentEnrichedSymbol) {
  const logPrefix = "  ".repeat(depth);
  if (!symbolToProcess.selectionRange) {
    log.debug(`${logPrefix}\u26A0\uFE0F Symbol '${symbolToProcess.name}' (Kind: ${symbolToProcess.kind}) skipped from enrichment. No selectionRange.`);
    return symbolToProcess;
  }
  log.debug(`${logPrefix}\u{1F50D} Processing symbol: ${symbolToProcess.name} (Kind: ${symbolToProcess.kind})`);
  const enrichedSym = {
    ...symbolToProcess,
    fileUri: symbolToProcess.fileUri ?? currentFileUri
  };
  enrichWithBasicInfo(enrichedSym, logPrefix, currentFileUri, dependencies);
  try {
    await Promise.all([
      enrichWithTypesFromDetail(enrichedSym, logPrefix, dependencies),
      (async () => {
        if (!enrichedSym.hoverChecked) {
          await enrichWithHoverTypes(enrichedSym, logPrefix, dependencies);
          enrichedSym.hoverChecked = true;
        }
      })()
    ]);
  } catch (e) {
    log.debug(`${logPrefix}\u26A0\uFE0F Error in async enrich: ${e instanceof Error ? e.message : e}`);
  }
  try {
    enrichWithSourceRegexTypes(enrichedSym, logPrefix, dependencies);
  } catch (e) {
    log.debug(`${logPrefix}\u26A0\uFE0F Error in enrichWithSourceRegexTypes: ${e instanceof Error ? e.message : e}`);
  }
  if (enrichedSym.children && enrichedSym.children.length > 0) {
    const parentForNextRecursion = enrichedSym.kind === vscode19.SymbolKind.Class ? enrichedSym : parentEnrichedSymbol;
    enrichedSym.children = await Promise.all(
      enrichedSym.children.map(
        (child) => processSymbolRecursiveLSP(child, enrichedSym.fileUri, dependencies, depth + 1, parentForNextRecursion)
      )
    );
  }
  return enrichedSym;
}

// src/ui/webview_creator.ts
async function createWebview(context, data) {
  function getLanguage() {
    const config = vscode20.workspace.getConfiguration("satori");
    return config.get("language", "en");
  }
  const panel = vscode20.window.createWebviewPanel(
    "astDiagram",
    "AST Diagram",
    vscode20.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode20.Uri.joinPath(context.extensionUri, "media")
      ]
    }
  );
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${panel.webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com https://unpkg.com ${panel.webview.cspSource}`,
    `img-src data: ${panel.webview.cspSource}`
  ].join("; ");
  log.debug("Starting data enrichment for webview..");
  resolvedTypesCache.clear();
  const allFilePaths = data.files.map((f) => f.file);
  const projectClassRelations = buildClassRelationsFromSymbols(data.files);
  log.debug(`Verifying files and symbols before enrichment:`);
  log.debug(`AST relations detected: ${projectClassRelations.size}classes.`);
  const processedFilesPromises = data.files.map(async (f_item) => {
    const fileContent = fs9.readFileSync(f_item.file, "utf8");
    const fileUriString = typeof f_item.fileUri === "string" && f_item.fileUri.startsWith("file:") ? f_item.fileUri : vscode20.Uri.file(f_item.file).toString();
    const enrichmentDeps = {
      projectClassRelations,
      fileContent,
      allProjectFilesData: data.files.map((df) => ({
        ...df,
        fileUri: typeof df.fileUri === "string" && df.fileUri.startsWith("file:") ? df.fileUri : vscode20.Uri.file(df.file).toString()
      }))
    };
    const processedSymbols = f_item.symbols ? await Promise.all(f_item.symbols.map(
      (sym) => {
        return processSymbolRecursiveLSP(
          sym,
          fileUriString,
          enrichmentDeps,
          0,
          void 0
        );
      }
    )) : [];
    return { ...f_item, fileUri: fileUriString, symbols: processedSymbols };
  });
  data.files = await Promise.all(processedFilesPromises);
  log.debug("\u2705 Deep enrichment of all files completed.");
  log.debug("Phase 2: Building project graph model...");
  const projectGraph = await buildGraphModel(data.files, data.projectRoot);
  log.debug(`Phase 2: Graph model built. Nodes:  Nodos: ${projectGraph.nodes.length}, Aristas: ${projectGraph.edges.length}`);
  log.debug("Calculating coupling degrees (in/out degree) of nodes...");
  calculateNodeDegrees(projectGraph);
  log.debug("\u2705 Coupling degrees calculated.");
  log.debug("Phase 2 (Continuation): Starting resolution of this.fieldName in constructors...");
  data.files.forEach((fileData) => {
    const existingUniqueIds = /* @__PURE__ */ new Set();
    function findClassAndResolveThisFieldsRecursive(symbols) {
      if (!symbols) return;
      for (const s of symbols) {
        log.debug(`[DEBUG-KIND-CHECK] Symbol: ${s.name}, kind: ${s.kind}, children: ${s.children?.length ?? 0}`);
        if (s.uniqueId) {
          existingUniqueIds.add(s.uniqueId);
        }
        if (s.kind === 5 && s.children) {
          const classSymbol = s;
          log.debug(`[DEBUG-CLASS] Class detected: ${classSymbol.name}`);
          classSymbol.children?.forEach((member) => {
            log.debug(`[DEBUG-MEMBER] ${classSymbol.name}.${member.name || "(anon)"} - kind: ${member.kind}, params: ${member.parameters?.length ?? 0}`);
            if (member.kind === 9) {
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
                  log.debug(`[DEBUG-RELATIONSHIP] Established parent of constructor  ${member.name || "(default)"} -> ${classSymbol.uniqueId}`);
                }
                log.debug(`  [ResolveThisField] Processing constructor ${classSymbol.name}.${member.name || "(default)"}`);
                member.parameters.forEach((param) => {
                  if (param.type?.startsWith("self_field:")) {
                    const fieldName = param.type.substring("self_field:".length);
                    const fieldSymbol = classSymbol.children?.find(
                      (f) => f.name === fieldName && (f.kind === 7 || f.kind === 8)
                    );
                    if (fieldSymbol) {
                      if (fieldSymbol.resolvedType) {
                        log.debug(`    \u21B3 Param '${param.name || fieldName}' (this.${fieldName}): tipo actualizado de '${param.type}' a '${fieldSymbol.resolvedType}'. Def. enlazada: ${!!fieldSymbol.resolvedTypeRef?.definition}`);
                        param.type = fieldSymbol.resolvedType;
                        param.typeRef = fieldSymbol.resolvedTypeRef ? { ...fieldSymbol.resolvedTypeRef } : { name: fieldSymbol.resolvedType };
                      } else {
                        log.debug(`    \u26A0\uFE0F Param '${param.name || fieldName}' (this.${fieldName}): Campo encontrado pero sin resolvedType en ${classSymbol.name}`);
                        param.typeRef = { name: param.type };
                      }
                    } else {
                      log.debug(`    \u274C Param '${param.name || fieldName}': Campo '${fieldName}' NO encontrado en ${classSymbol.name}`);
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
      let validateParentIds2 = function(symbols) {
        if (!symbols) return;
        for (const sym of symbols) {
          if (sym.parentId && !existingUniqueIds.has(sym.parentId)) {
            log.debug(`\u274C Inconsistency detected: parentId'${sym.parentId}' of '${sym.name}' does not exist in the uniqueIds set.`);
          }
          if (sym.children) {
            validateParentIds2(sym.children);
          }
        }
      };
      var validateParentIds = validateParentIds2;
      findClassAndResolveThisFieldsRecursive(fileData.symbols);
      log.debug(`[DEBUG-VALIDATE] Verifying consistency of parentId \u2194 uniqueId...`);
      validateParentIds2(fileData.symbols);
    } else {
      log.debug(`[DEBUG] \u26A0\uFE0F fileData.symbols is empty for: ${fileData.fileUri}`);
    }
  });
  log.debug("[\u2713] Resolution of this.fieldName fields in constructors completed.");
  const dataForWebview = {
    projectRoot: data.projectRoot,
    graph: projectGraph
  };
  log.debug("[Sanitize] Starting string sanitization for JSON....");
  sanitizeObjectStrings(dataForWebview);
  log.debug("[Sanitize] String sanitization completed.");
  const astJson = JSON.stringify(dataForWebview).replace(/</g, "\\u003c");
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
  log.debug(`[DEBUG_JSON] Character codes of snippet: ${charCodes.join(", ")}`);
  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);
  const translations = {
    "loader.analyzing": t("loader.analyzing"),
    "loader.processing": t("loader.processing"),
    "loader.error": t("loader.error"),
    "loader.waiting": t("loader.waiting"),
    "loader.dataLoaded": t("loader.dataLoaded"),
    "button.back": t("button.back"),
    "layer.view": t("layer.view"),
    "layer.state": t("layer.state"),
    "layer.service": t("layer.service"),
    "layer.model": t("layer.model"),
    "layer.utility": t("layer.utility"),
    "overview.views": t("overview.views"),
    "overview.state": t("overview.state"),
    "overview.service": t("overview.service"),
    "overview.model": t("overview.model"),
    "overview.utility": t("overview.utility"),
    "overview.noLayers": t("overview.noLayers"),
    "context.traceFlow": t("context.traceFlow"),
    "search.placeholder": t("search.placeholder"),
    "search.noResults": t("search.noResults"),
    "folder.label": t("folder.label"),
    "breadcrumb.folders": t("breadcrumb.folders"),
    "legend.responsibilities": t("legend.responsibilities"),
    "legend.attributes": t("legend.attributes"),
    "legend.collaborators": t("legend.collaborators"),
    "legend.groupedObjects": t("legend.groupedObjects"),
    "legend.symbols": t("legend.symbols"),
    "legend.relationships": t("legend.relationships"),
    "packages.developed": t("packages.developed"),
    "packages.consumed": t("packages.consumed"),
    "edge.extends": t("edge.extends"),
    "edge.implements": t("edge.implements"),
    "edge.calls": t("edge.calls"),
    "edge.readsFrom": t("edge.readsFrom"),
    "edge.writesTo": t("edge.writesTo"),
    "narrative.showsUser": t("narrative.showsUser"),
    "narrative.readsFrom": t("narrative.readsFrom"),
    "narrative.buildsAndShows": t("narrative.buildsAndShows"),
    "narrative.instanceOf": t("narrative.instanceOf"),
    "narrative.notifies": t("narrative.notifies"),
    "narrative.delegates": t("narrative.delegates"),
    "narrative.formats": t("narrative.formats"),
    "narrative.managesState": t("narrative.managesState"),
    "narrative.reactsTo": t("narrative.reactsTo"),
    "narrative.implements": t("narrative.implements"),
    "narrative.extends": t("narrative.extends"),
    "overview.members": t("overview.members")
  };
  let html = fs9.readFileSync(
    import_path6.default.join(context.extensionUri.fsPath, "media", "webviewContent.html"),
    "utf8"
  );
  html = html.replace(/__CSP__/, csp).replace(/__NONCE__/g, nonce).replace(/__AST_JSON_PLACEHOLDER__/g, astJson).replace(/__TRANSLATIONS__/g, JSON.stringify(translations));
  panel.webview.html = html;
  panel.webview.onDidReceiveMessage(async (m) => {
    if (m.command === "log") {
      log.debug(m.args.join(" "));
    } else if (m.command === "openClass") {
      const uri = vscode20.Uri.parse(m.file);
      const start = new vscode20.Position(m.start.line, m.start.character);
      const end = new vscode20.Position(m.end.line, m.end.character);
      const range = new vscode20.Range(start, end);
      const existing = vscode20.window.visibleTextEditors.find(
        (e) => e.document.uri.fsPath === m.file && e.viewColumn === vscode20.ViewColumn.Two
      );
      if (existing) {
        existing.selection = new vscode20.Selection(start, end);
        existing.revealRange(range, vscode20.TextEditorRevealType.InCenter);
        return;
      }
      panel.reveal(panel.viewColumn, true);
      const doc = await vscode20.workspace.openTextDocument(uri);
      const editor = await vscode20.window.showTextDocument(doc, {
        viewColumn: vscode20.ViewColumn.Two,
        preview: true
      });
      editor.selection = new vscode20.Selection(start, end);
      editor.revealRange(range, vscode20.TextEditorRevealType.InCenter);
    } else if (m.command === "openFile") {
      const filePath = m.filePath;
      if (!filePath) {
        return;
      }
      const alreadyOpenEditor = vscode20.window.visibleTextEditors.find(
        (e) => e.document.uri.fsPath === filePath
      );
      if (alreadyOpenEditor) {
        vscode20.window.showTextDocument(alreadyOpenEditor.document, {
          viewColumn: alreadyOpenEditor.viewColumn,
          preserveFocus: false
        });
        return;
      }
      const uri = vscode20.Uri.parse(filePath);
      try {
        const doc = await vscode20.workspace.openTextDocument(uri);
        await vscode20.window.showTextDocument(doc, {
          viewColumn: vscode20.ViewColumn.Two,
          preview: true
        });
      } catch (error) {
        log.error(`Error opening file:${filePath}`);
      }
    }
  });
  return { panel, graph: projectGraph };
}
function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
function buildClassRelationsFromSymbols(filesData) {
  const relations = /* @__PURE__ */ new Map();
  const extendsRegex = /extends\s+([\w<, >]+)/;
  const withRegex = /with\s+([\w<, >]+(?:\s*,\s*[\w<, >]+)*)/;
  const implementsRegex = /implements\s+([\w<, >]+(?:\s*,\s*[\w<, >]+)*)/;
  function findClassesRecursive(symbols, fileUri) {
    for (const symbol of symbols) {
      if (symbol.kind === vscode20.SymbolKind.Class && symbol.detail) {
        const className = symbol.name;
        const classRelations = { extends: [], with: [], implements: [] };
        const extendsMatch = symbol.detail.match(extendsRegex);
        if (extendsMatch) {
          classRelations.extends.push(extendsMatch[1].trim());
        }
        const withMatch = symbol.detail.match(withRegex);
        if (withMatch) {
          classRelations.with.push(...withMatch[1].split(",").map((s) => s.trim()));
        }
        const implementsMatch = symbol.detail.match(implementsRegex);
        if (implementsMatch) {
          classRelations.implements.push(...implementsMatch[1].split(",").map((s) => s.trim()));
        }
        relations.set(`${fileUri}#${className}`, classRelations);
      }
      if (symbol.children) {
        findClassesRecursive(symbol.children, fileUri);
      }
    }
  }
  for (const file of filesData) {
    findClassesRecursive(file.symbols, file.fileUri);
  }
  return relations;
}

// src/ui/command_registry.ts
var vscode21 = __toESM(require("vscode"));
function registerDebugCommands(context) {
  const toggleDebugCommand = vscode21.commands.registerCommand(
    "satori.toggleDebugLogs",
    () => {
      const currentState = log.isDebug();
      log.setDebug(!currentState);
      vscode21.window.showInformationMessage(
        `Debug logs ${!currentState ? "enabled" : "disabled"}`
      );
    }
  );
  context.subscriptions.push(toggleDebugCommand);
}

// src/analysis/symbol_transformer.ts
function transformLspSymbols(lspSymbols, parentId, fileUri) {
  if (!lspSymbols || lspSymbols.length === 0) return [];
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

// src/ui/extension_lifecycle.ts
var ExtensionState = class {
  mainGraphPanel;
  projectGraph;
  /**
   * Sets the webview panel and project graph in the global state.
   * 
   * @param panel - Webview panel that displays the graph visualization
   * @param graph - Graph data model with the project's nodes and edges
   */
  setGraph(panel, graph) {
    this.mainGraphPanel = panel;
    this.projectGraph = graph;
  }
  /**
   * Clears the global state, releasing references to the panel and graph.
   * Typically called when the visualization panel is closed.
   */
  clear() {
    this.mainGraphPanel = void 0;
    this.projectGraph = void 0;
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
  const workspaceFolders = vscode22.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode22.window.showErrorMessage("No workspace folder found. Please open a Flutter project.");
    return void 0;
  }
  for (const folder of workspaceFolders) {
    const pubspecFiles = await vscode22.workspace.findFiles(
      new vscode22.RelativePattern(folder, "pubspec.yaml"),
      "**/.*",
      1
    );
    if (pubspecFiles.length > 0) {
      log.debug(`\u2705 Found pubspec.yaml at: ${pubspecFiles[0].fsPath}`);
      log.debug(`\u{1F4C1} Project root: ${folder.uri.fsPath}`);
      return folder.uri;
    }
  }
  vscode22.window.showErrorMessage("No Flutter project found. Make sure pubspec.yaml exists in your workspace.");
  return void 0;
}
async function analyzeProject(rootUri, context, progress) {
  const root = rootUri.fsPath;
  log.debug(`\u{1F50D} Analyzing project at: ${root}`);
  log.debug(`\u{1F4CA} Root URI - scheme: ${rootUri.scheme}, fsPath: ${rootUri.fsPath}`);
  log.debug(`\u{1F4CA} Root URI - toString: ${rootUri.toString()}`);
  const isProjectRoot = fs10.existsSync(import_path7.default.join(root, "pubspec.yaml"));
  log.debug(`\u{1F4CA} Is project root (has pubspec.yaml): ${isProjectRoot}`);
  progress.report({ increment: 10, message: t("progress.searchingFiles") });
  log.debug("\u{1F4C2} Searching files in standard directories...");
  const standardPatterns = isProjectRoot ? [
    "lib/**/*.dart"
  ] : [
    "**/*.dart"
  ];
  log.debug(`\u{1F4CA} Using patterns: ${JSON.stringify(standardPatterns)}`);
  let uris = [];
  let totalFilesByPattern = {};
  for (const pattern of standardPatterns) {
    try {
      const files = await vscode22.workspace.findFiles(
        new vscode22.RelativePattern(rootUri, pattern),
        "**/.dart_tool/**"
      );
      uris.push(...files);
      totalFilesByPattern[pattern] = files.length;
      log.debug(`  \u2022 Pattern '${pattern}': ${files.length} files`);
    } catch (error) {
      log.error(`  \u274C Error searching pattern '${pattern}': ${error.message}`);
      totalFilesByPattern[pattern] = 0;
    }
  }
  log.debug(`\u{1F4CA} Files found by pattern: ${JSON.stringify(totalFilesByPattern, null, 2)}`);
  progress.report({ increment: 20, message: t("progress.searchingCustomDirs") });
  let customDirectories = [];
  if (isProjectRoot) {
    try {
      customDirectories = await findCustomDartDirectories(rootUri);
      log.debug(`\u{1F50D} Found ${customDirectories.length} custom directories`);
    } catch (error) {
      log.error(`\u274C Error finding custom directories: ${error.message}`);
    }
    for (const customDir of customDirectories) {
      try {
        const customFiles = await vscode22.workspace.findFiles(
          new vscode22.RelativePattern(customDir, "**/*.dart"),
          "**/.*"
        );
        uris.push(...customFiles);
        const relativePath = import_path7.default.relative(root, customDir.fsPath);
        log.debug(` \u2022 Custom directory  '${relativePath}': ${customFiles.length} files`);
      } catch (error) {
        log.error(`  \u274C Error in custom directory ${customDir.fsPath}: ${error.message}`);
      }
    }
  } else {
    log.debug(`\u{1F4CA} Skipping custom directory search (not in project root)`);
  }
  const uniqueUris = Array.from(new Set(uris.map((u) => u.toString()))).map((uriString) => vscode22.Uri.parse(uriString));
  log.debug(`\u{1F4C4} Total unique files found: ${uniqueUris.length}`);
  if (uniqueUris.length === 0) {
    log.info("\u274C No Dart files found in the project.");
    vscode22.window.showWarningMessage("No Dart files found in the project. Please check your project structure.");
    return null;
  }
  log.debug(`\u{1F4C4} Sample of found files (first 5):`);
  uniqueUris.slice(0, 5).forEach((uri, idx) => {
    log.debug(`  ${idx + 1}. ${uri.fsPath}`);
  });
  progress.report({ increment: 30, message: t("progress.analyzingFiles", uniqueUris.length.toString()) });
  const filesDataArray = [];
  let analyzedCount = 0;
  let errorCount = 0;
  let emptyCount = 0;
  for (const u of uniqueUris) {
    let syms = [];
    try {
      const raw = await vscode22.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        u
      );
      if (raw === null) {
        log.debug(`[DIAGNOSTIC] Received NULL for ${import_path7.default.basename(u.fsPath)}`);
        emptyCount++;
      } else if (raw === void 0) {
        log.debug(`[DIAGNOSTIC] Received UNDEFINED for ${import_path7.default.basename(u.fsPath)}`);
        errorCount++;
      } else if (!Array.isArray(raw)) {
        log.debug(`[DIAGNOSTIC] Received non-array type for ${import_path7.default.basename(u.fsPath)}: ${typeof raw}`);
        errorCount++;
      } else if (raw.length === 0) {
        emptyCount++;
      } else {
        analyzedCount++;
      }
      const rawSymbols = Array.isArray(raw) ? raw : [];
      syms = transformLspSymbols(rawSymbols, void 0, u.toString());
    } catch (e) {
      log.error(`\u26A0\uFE0F Error getting symbols for ${import_path7.default.basename(u.fsPath)}: ${e.message}`);
      errorCount++;
    }
    filesDataArray.push({ file: u.fsPath, fileUri: u.toString(), symbols: syms });
    const progressIncrement = 40 / uniqueUris.length;
    progress.report({
      increment: progressIncrement,
      message: t("progress.analyzingFile")
    });
  }
  log.debug(`\u{1F4CA} Analysis Summary:`);
  log.debug(`   \u2705 Successfully analyzed: ${analyzedCount} files`);
  log.debug(`   \u{1F4ED} Empty results: ${emptyCount} files`);
  log.debug(`   \u274C Errors: ${errorCount} files`);
  log.debug(`   \u{1F4E6} Total files processed: ${filesDataArray.length}`);
  if (filesDataArray.every((f) => f.symbols.length === 0) && filesDataArray.length > 0) {
    log.info("\u26A0\uFE0F No classes/symbols found in any project Dart files.");
    vscode22.window.showWarningMessage("No classes or symbols found in the project. The diagram may be empty.");
  }
  progress.report({ increment: 80, message: t("progress.buildingGraph") });
  log.debug(`\u{1F4E6} Preparing to create webview...`);
  log.debug(`\u{1F4E6} Project root for webview: ${root}`);
  log.debug(`\u{1F4E6} Total files for webview: ${filesDataArray.length}`);
  try {
    log.debug(`\u{1F680} Calling createWebview function...`);
    const result = await createWebview(context, {
      projectRoot: root,
      files: filesDataArray
    });
    const { panel, graph } = result;
    log.debug(`\u2705 Webview created successfully!`);
    log.debug(`\u{1F4CA} Graph stats: ${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`);
    if (!graph.nodes || graph.nodes.length === 0) {
      log.error(`\u26A0\uFE0F WARNING: Graph has no nodes!`);
      vscode22.window.showWarningMessage("The graph was created but contains no nodes. Check the logs for details.");
    }
    progress.report({ increment: 95, message: t("progress.configuringInterface") });
    return { panel, graph };
  } catch (error) {
    log.error(`\u274C CRITICAL ERROR creating webview:`);
    log.error(`   Message: ${error.message}`);
    log.error(`   Stack: ${error.stack}`);
    vscode22.window.showErrorMessage(`Failed to create visualization: ${error.message}`);
    return null;
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
          try {
            const uri = vscode22.Uri.parse(message.file);
            const start = new vscode22.Position(message.start.line, message.start.character);
            const end = new vscode22.Position(message.end.line, message.end.character);
            const range = new vscode22.Range(start, end);
            const existingEditor = vscode22.window.visibleTextEditors.find(
              (e) => e.document.uri.fsPath === uri.fsPath && e.viewColumn === vscode22.ViewColumn.Two
            );
            if (existingEditor) {
              existingEditor.selection = new vscode22.Selection(start, end);
              existingEditor.revealRange(range, vscode22.TextEditorRevealType.InCenter);
            } else {
              const doc = await vscode22.workspace.openTextDocument(uri);
              const editor = await vscode22.window.showTextDocument(doc, {
                viewColumn: vscode22.ViewColumn.Two,
                preview: true,
                selection: range
              });
              editor.revealRange(range, vscode22.TextEditorRevealType.InCenter);
            }
          } catch (e) {
            console.error(e);
            log.error(`Could not open or read file: ${message.file}`);
          }
          return;
        case "showRelationships":
          if (message.data && currentGraph) {
            const focusedNode = currentGraph.nodes.find(
              (node) => node.label === message.data.focusedNodeLabel || node.id === message.data.focusedNodeId
            );
            detailsProvider.updateDetails({
              ...message.data,
              focusedNode
            });
          } else {
            detailsProvider.updateDetails(message.data);
          }
          return;
        case "getImports": {
          if (!message.nodeId || !currentGraph || !currentPanel) return;
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
        case "traceDataFlow": {
          if (message.startNodeId && currentGraph && currentPanel) {
            log.debug(`[Extension] Calculating data flow for: ${message.startNodeId}`);
            const flowPath = calculateDataFlow(currentGraph, message.startNodeId);
            log.debug(`[Extension] Path found: ${flowPath.join(" -> ")}`);
            currentPanel.webview.postMessage({
              command: "displayDataFlow",
              path: flowPath
            });
          }
          return;
        }
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
    const config = vscode22.workspace.getConfiguration("satori");
    return config.get("language", "en");
  }
  log.debug("\u{1F680} Satori: starting\u2026");
  const language = getLanguage();
  await Localization.getInstance().loadTranslations(context.extensionPath, language);
  const dartExtension = vscode22.extensions.getExtension("Dart-Code.dart-code");
  if (!dartExtension || !dartExtension.isActive) {
    vscode22.window.showErrorMessage(
      "Dart extension is required for Satori to work properly."
    );
    return;
  }
  log.debug("Dart extension detected, using existing language services");
  registerDebugCommands(context);
  const state = new ExtensionState();
  const detailsProvider = new DetailsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode22.window.registerWebviewViewProvider(DetailsViewProvider.viewType, detailsProvider)
  );
  const analyzeCurrentProjectCommand = vscode22.commands.registerCommand(
    "satori.analyzeProject",
    async () => {
      log.debug("========== EXECUTING satori.analyzeProject ==========");
      const rootUri = await findFlutterProjectRoot();
      if (!rootUri) {
        log.debug("\u274C No Flutter project root found - ABORTING");
        return;
      }
      log.debug(`\u2705 Flutter project root confirmed: ${rootUri.fsPath}`);
      await vscode22.window.withProgress({
        location: vscode22.ProgressLocation.Notification,
        title: "Satori",
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: t("progress.starting") });
        log.debug(`\u{1F504} Starting analysis process...`);
        const result = await analyzeProject(rootUri, context, progress);
        if (!result) {
          log.debug("Analysis returned NULL - ABORTING");
          vscode22.window.showErrorMessage("Analysis failed. Check the Output panel (Satori) for details.");
          return;
        }
        log.debug("Analysis complete! Setting up state and handlers...");
        state.setGraph(result.panel, result.graph);
        setupWebviewMessageHandlers(state, detailsProvider, context);
        progress.report({ increment: 100, message: t("progress.completed") });
        log.debug("========== satori.analyzeProject COMPLETED SUCCESSFULLY ==========");
      });
    }
  );
  log.info("Command satori.analyzeProject registered");
  context.subscriptions.push(analyzeCurrentProjectCommand);
  const showProjectDiagramCommand = vscode22.commands.registerCommand(
    "extension.showProjectDiagram",
    async () => {
      log.debug("========== EXECUTING extension.showProjectDiagram ==========");
      const pick = await vscode22.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select project folder"
      });
      if (!pick?.length) {
        log.debug("No folder selected - ABORTING");
        return;
      }
      log.debug(`Folder selected: ${pick[0].fsPath}`);
      await vscode22.window.withProgress({
        location: vscode22.ProgressLocation.Notification,
        title: "Satori",
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: t("progress.starting") });
        log.debug(`\u{1F504} Starting analysis process...`);
        const result = await analyzeProject(pick[0], context, progress);
        if (!result) {
          log.debug("Analysis returned NULL - ABORTING");
          vscode22.window.showErrorMessage("Analysis failed. Check the Output panel (Satori) for details.");
          return;
        }
        log.debug("Analysis complete! Setting up state and handlers...");
        state.setGraph(result.panel, result.graph);
        setupWebviewMessageHandlers(state, detailsProvider, context);
        progress.report({ increment: 100, message: t("progress.completed") });
        log.debug("\u{1F389} ========== extension.showProjectDiagram COMPLETED SUCCESSFULLY ==========");
      });
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
            const uri = vscode22.Uri.parse(node.data.fileUri);
            const doc = await vscode22.workspace.openTextDocument(uri);
            await vscode22.window.showTextDocument(doc, {
              viewColumn: vscode22.ViewColumn.Two,
              preview: false,
              preserveFocus: false
            });
            log.debug(`Successfully opened file: ${node.data.fileUri}`);
          } catch (error) {
            log.error(`Error opening file ${node.data.fileUri}: ${error}`);
            vscode22.window.showErrorMessage(`Could not open file: ${node.label}`);
          }
          return;
        }
      }
    });
    return originalResolveWebviewView(webviewView, ...args);
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
//# sourceMappingURL=extension.js.map
