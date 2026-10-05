import { stripCommentsAndStrings, mapLimited, retryUntil } from "../core";
import { classifyAccess, AccessKind } from "../analysis/access_classifier";
import { getFileLines } from "../analysis/source_analyzer";
import { isPathInside } from "../filesystem/path_utils";
import { ProjectGraphModel, ProjectGraphNode, EnrichedSymbol, ProjectGraphEdge } from "../types/index";
import * as vscode from 'vscode';
import { log } from "../utils/logger";


let nodesByFileCache: Map<string, ProjectGraphNode[]> | null = null;

/**
 * Builds or returns the cached index of nodes grouped by file URI.
 * Avoids re-filtering the full node array on every reference lookup.
 */
function getNodesByFile(nodes: ProjectGraphNode[]): Map<string, ProjectGraphNode[]> {
    if (nodesByFileCache) {return nodesByFileCache;}
    nodesByFileCache = new Map<string, ProjectGraphNode[]>();
    for (const node of nodes) {
        const uri = node.data.fileUri;
        if (!nodesByFileCache.has(uri)) {nodesByFileCache.set(uri, []);}
        nodesByFileCache.get(uri)!.push(node);
    }
    log.debug(`[RefAnalysis] nodesByFile index built: ${nodesByFileCache.size} files`);
    return nodesByFileCache;
}

/**
 * Clears the nodesByFile cache. Call this at the start of each
 * analysis pass alongside clearFileContentCache().
 */
export function clearNodesByFileCache(): void {
    nodesByFileCache = null;
    referencesCache.clear();
    emptyAnswerStreak = 0;
    log.debug(`[RefAnalysis] nodesByFile + references cache cleared.`);
}

const referencesCache = new Map<string, vscode.Location[] | null>();

const EMPTY_ANSWER_RETRY_DELAYS_MS = [250, 750, 1500];
const MAX_EMPTY_STREAK = 8;
/** Symbols in a row that stayed empty after every retry; past the limit retries stop so a server that cannot answer does not slow the analysis. */
let emptyAnswerStreak = 0;


async function getReferencesForSymbol(symbol: EnrichedSymbol): Promise<vscode.Location[] | null> {
    const { line, character } = symbol.selectionRange!.start;
    const cacheKey = `${symbol.fileUri}:${line}:${character}`;
 
    if (referencesCache.has(cacheKey)) {
        const cached = referencesCache.get(cacheKey)!;
        log.debug(`[RefCache HIT] '${symbol.name}' -> ${cached?.length ?? 0} refs`);
        return cached;
    }
 
    try {
        const ask = async () => await vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            vscode.Uri.parse(symbol.fileUri!),
            symbol.selectionRange!.start
        ) as vscode.Location[] | undefined;
        const hasReferences = (r: vscode.Location[] | undefined) => !!r && r.length > 0;

        // A symbol always references its own declaration, so an empty answer means the server is still analysing.
        // Retrying avoids caching that emptiness for the whole run, unless the server keeps answering nothing.
        const delays = emptyAnswerStreak >= MAX_EMPTY_STREAK ? [] : EMPTY_ANSWER_RETRY_DELAYS_MS;
        const outcome = await retryUntil(ask, hasReferences, delays);
        emptyAnswerStreak = outcome.exhausted ? emptyAnswerStreak + 1 : 0;
        if (outcome.attempts > 1) {
            log.debug(`[LSP] '${symbol.name}' needed ${outcome.attempts} attempts${outcome.exhausted ? ' and still returned nothing' : ''}`);
        }
        const references = outcome.result;

        const result = hasReferences(references) ? references! : null;
        referencesCache.set(cacheKey, result);
        log.debug(`[LSP] ✅ Found ${result?.length ?? 0} references for '${symbol.name}' [cached]`);
        return result;
    } catch (err) {
        referencesCache.set(cacheKey, null);
        log.error(`[GraphBuilder] ⚠️ LSP error for '${symbol.name}'`);
        return null;
    }
}

/**
 * Attempts to add a READS_FROM edge between nodes by analyzing LSP references.
 * Searches for references of the target symbol and verifies if any occur within
 * the source node's source code. Includes helper function to find the
 * function/method container that encloses a reference.
 * 
 * @param projectGraph - Project graph model
 * @param client - LSP client for reference queries
 * @param sourceNode - Source node that might read the target
 * @param targetNode - Target node that might be read
 * @param targetSymbol - Target symbol for LSP query
 * @param sourceCodeText - Source code text of the source node
 * @param createEdge - Function to create new edges
 */

export async function tryAddReadsFromEdge(
  projectGraph: ProjectGraphModel,
  sourceNode: ProjectGraphNode,
  targetNode: ProjectGraphNode,
  targetSymbol: EnrichedSymbol,
  sourceCodeText: string,
  createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void
): Promise<void> {
  const cleanedSource = stripCommentsAndStrings(sourceCodeText);
 
  if (!cleanedSource.includes(targetSymbol.name)) {
    log.debug(`[LSP] Skipping '${targetSymbol.name}' — not found in source of '${sourceNode.label}'`);
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
      log.debug(`[LSP] 🎯 READS_FROM: '${sourceNode.label}' -> '${targetNode.label}'`);
      createEdge(sourceNode.id, targetNode.id, 'READS_FROM');
      return;
    }
  }
 
  log.debug(`[LSP] 🧭 No reference found within container '${sourceNode.label}'`);
}

const FIELD_KINDS = new Set(['field', 'property', 'variable', 'constant']);
const ACCESS_LABEL: Record<AccessKind, 'READS_FROM' | 'WRITES_TO' | 'PASSES_AS_ARGUMENT'> = {
    read: 'READS_FROM',
    write: 'WRITES_TO',
    pass: 'PASSES_AS_ARGUMENT'
};
const REFERENCE_CONCURRENCY = 6;

/**
 * Adds READS_FROM, WRITES_TO and PASSES_AS_ARGUMENT edges between the methods, functions and
 * constructors of the project and the fields or properties they touch.
 *
 * The Dart language server tells where each field is referenced; the text around every reference
 * tells how it is used. Only fields whose name appears in some method body are asked about, which
 * keeps the number of language-server requests low.
 *
 * @param usedIdentifiers - Every identifier written inside the analysed method bodies
 * @param projectRoot - When given, fields declared outside of it (SDK, packages) are ignored
 */
export async function addFieldAccessEdges(
    projectGraph: ProjectGraphModel,
    symbolMapById: Map<string, EnrichedSymbol>,
    usedIdentifiers: Set<string>,
    projectRoot: string | undefined,
    createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void
): Promise<void> {
    const nodesById = new Map(projectGraph.nodes.map(n => [n.id, n]));
    const nodesByFile = getNodesByFile(projectGraph.nodes);

    const candidates = projectGraph.nodes.filter(n => {
        const symbol = symbolMapById.get(n.id);
        if (!FIELD_KINDS.has(n.kind) || !symbol || !symbol.selectionRange || !symbol.fileUri) { return false; }
        if (!usedIdentifiers.has(symbol.name)) { return false; }
        return !projectRoot || isPathInside(vscode.Uri.parse(n.data.fileUri).fsPath, projectRoot);
    });
    log.debug(`[FieldAccess] ${candidates.length} fields to check of ${projectGraph.nodes.filter(n => FIELD_KINDS.has(n.kind)).length}`);

    const found = await mapLimited(candidates, REFERENCE_CONCURRENCY, async (field) => {
        const symbol = symbolMapById.get(field.id)!;
        const references = await getReferencesForSymbol(symbol);
        const kindsByContainer = new Map<string, Set<AccessKind>>();
        for (const ref of references ?? []) {
            if (ref.range.start.line !== ref.range.end.line) { continue; }
            const container = findEnclosingCodeNode(nodesByFile, ref.uri.toString(), ref.range.start.line);
            if (!container || container.id === field.id) { continue; }
            const lines = getFileLines(ref.uri.toString());
            const text = lines?.[ref.range.start.line];
            if (text === undefined) { continue; }

            const owner = container.parent ? nodesById.get(container.parent) : undefined;
            const constructorNames = container.kind === 'constructor'
                ? [container.label, owner?.label].filter((n): n is string => !!n)
                : undefined;
            const kinds = classifyAccess(text, ref.range.start.character, ref.range.end.character, { constructorNames });
            const set = kindsByContainer.get(container.id) ?? new Set<AccessKind>();
            kinds.forEach(k => set.add(k));
            kindsByContainer.set(container.id, set);
        }
        return kindsByContainer;
    });

    let created = 0;
    candidates.forEach((field, i) => {
        found[i].forEach((kinds, containerId) => {
            (['read', 'write', 'pass'] as AccessKind[]).forEach(kind => {
                if (kinds.has(kind)) {
                    createEdge(containerId, field.id, ACCESS_LABEL[kind]);
                    created++;
                }
            });
        });
    });
    log.debug(`[FieldAccess] ${created} field access edges created`);
}

/**
 * Adds CALLS edges for methods whose name is shared by several declarations. Matching such calls by
 * name would link every caller to every declaration (a project with a `build()` per widget gets
 * thousands of false edges), so the language server is asked where each declaration is really used.
 * Only references written as a call, `name(` or `name<T>(`, count.
 */
export async function addAmbiguousCallEdges(
    projectGraph: ProjectGraphModel,
    symbolMapById: Map<string, EnrichedSymbol>,
    candidates: Set<EnrichedSymbol>,
    createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void
): Promise<void> {
    const idBySymbol = new Map<EnrichedSymbol, string>();
    symbolMapById.forEach((symbol, id) => idBySymbol.set(symbol, id));
    const nodesByFile = getNodesByFile(projectGraph.nodes);
    const list = Array.from(candidates).filter(s => s.selectionRange && s.fileUri && idBySymbol.has(s));
    log.debug(`[CallResolution] ${list.length} methods share their name with another one; asking the language server`);

    const callers = await mapLimited(list, REFERENCE_CONCURRENCY, async (symbol) => {
        const targetId = idBySymbol.get(symbol)!;
        const found = new Set<string>();
        for (const ref of (await getReferencesForSymbol(symbol)) ?? []) {
            if (ref.range.start.line !== ref.range.end.line) { continue; }
            const container = findEnclosingCodeNode(nodesByFile, ref.uri.toString(), ref.range.start.line);
            if (!container || container.id === targetId) { continue; }
            const text = getFileLines(ref.uri.toString())?.[ref.range.start.line];
            if (text !== undefined && /^\s*(?:<[^()]*>)?\s*\(/.test(text.slice(ref.range.end.character))) {
                found.add(container.id);
            }
        }
        return found;
    });

    let created = 0;
    list.forEach((symbol, i) => {
        callers[i].forEach(callerId => {
            createEdge(callerId, idBySymbol.get(symbol)!, 'CALLS');
            created++;
        });
    });
    log.debug(`[CallResolution] ${created} call edges created from ${list.length} ambiguous methods`);
}

/** Method, function or constructor node whose lines contain `line`. */
function findEnclosingCodeNode(
    nodesByFile: Map<string, ProjectGraphNode[]>,
    uri: string,
    line: number
): ProjectGraphNode | undefined {
    return (nodesByFile.get(uri) ?? []).find(n => {
        const range = n.data.range;
        return (n.kind === 'method' || n.kind === 'function' || n.kind === 'constructor') &&
            range !== undefined && range.start.line <= line && range.end.line >= line;
    });
}

/**
 * Finds the function or method node that encloses a specific reference.
 * Searches in nodes from the same file and verifies if the reference range
 * is contained within the range of any method or function.
 * 
 * @param nodes - Array of graph nodes to search in
 * @param ref - Reference with URI and range to analyze
 * @returns Container node or undefined if not found
 */

function findEnclosingFunctionOrMethodNode(
    nodesByFile: Map<string, ProjectGraphNode[]>,
    ref: { uri: string; range: vscode.Range }
): ProjectGraphNode | undefined {
    const nodesInFile = nodesByFile.get(ref.uri) ?? [];
    const pos = ref.range.start;
 
    return nodesInFile.find(n => {
        const range = n.data.range;
        return (
            (n.kind === 'method' || n.kind === 'function') &&
            range !== undefined &&
            range.start.line <= pos.line &&
            range.end.line >= pos.line
        );
    });
}
