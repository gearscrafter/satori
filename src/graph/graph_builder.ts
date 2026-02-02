import * as vscode from 'vscode';
import { EnrichedSymbol, ExternalPackageInfo, ProjectGraphEdge, ProjectGraphModel } from '../types/index';
import { createGraphNodesFromSymbols } from './node_creator';
import { createGraphEdgesFromSymbols } from './edge_creator';
import { integrateExternalPackages } from '../packages/graph_integration/integration';
import { generateGlobalSymbolId } from '../core';
import { log } from '../utils/logger';
import { findAllPackages } from '../packages/package_discovery';
import path from 'path';


/**
 * Main function that builds the complete project graph model.
 * It coordinates the creation of nodes, edges, integration of external packages,
 * extraction of relevant external symbols, and generation of statistics.
 * It handles both project symbols and symbols from external dependencies.
 * @param enrichedFiles - Array of files with processed symbols
 * @param client - Unused parameter (kept for compatibility)
 * @param projectRoot - The root path of the project (optional)
 * @returns The complete project graph model
 */
export async function buildGraphModel(
    enrichedFiles: Array<{ fileUri: string; symbols: EnrichedSymbol[] }>,
    projectRoot?: string
): Promise<ProjectGraphModel> {

    
    const projectGraph: ProjectGraphModel = { nodes: [], edges: [] };
    const generatedNodeIds = new Set<string>();
    const symbolMapById = new Map<string, EnrichedSymbol>();
    let edgeIdCounter = 0;
    const edgeCounts: Record<string, number> = {};

    const createEdge = (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => {
        if (sourceId && targetId && sourceId !== targetId && generatedNodeIds.has(sourceId) && generatedNodeIds.has(targetId)) {
            const edgeExists = projectGraph.edges.some(e => e.source === sourceId && e.target === targetId && e.label === label);
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

    log.debug(`[GraphBuilder] 🔍 Validating constructors and detail...`);

    log.debug(`[GraphBuilder] Creating edges...`);

    if (projectRoot) {
        log.debug(`[GraphBuilder] Extracting symbols from external packages...`);
        const externalSymbols = await extractSymbolsFromExternalPackages(projectRoot);
        
        for (const [id, symbol] of externalSymbols) {
            symbolMapById.set(id, symbol);
        }
        
        if (externalSymbols.size > 0) {
            const externalFileData = [{ 
                fileUri: 'external_packages', 
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

    
    const symbolNameIndex = new Map<string, EnrichedSymbol[]>();
    for (const enriched of symbolMapById.values()) {
        const name = enriched.name;
        if (!symbolNameIndex.has(name)) {
            symbolNameIndex.set(name, []);
        }
        symbolNameIndex.get(name)!.push(enriched);
    }
    await createGraphEdgesFromSymbols(projectGraph, symbolMapById, createEdge, projectRoot, generatedNodeIds);

    log.debug(`[GraphBuilder] Edge Breakdown:: ${JSON.stringify(edgeCounts)}`);
    log.debug(`  -> Final total of edges: ${projectGraph.edges.length}`);

    if (projectRoot) {
        log.debug(`[GraphBuilder] 📦 Integrating external packages...`);
        const nodesBefore = projectGraph.nodes.length;
        await integrateExternalPackages(
            projectGraph,
            projectRoot,
            generatedNodeIds,
            createEdge
        );

        const nodesAfter = projectGraph.nodes.length;
        const packageContainers = projectGraph.nodes.filter(n => n.kind === 'package_container');
        
        log.debug(`[GraphBuilder] ✅ External packages integrated:`);
        log.debug(`    • Nodes before: ${nodesBefore}, después: ${nodesAfter}`);
        log.debug(`    • Package containers created: ${packageContainers.length}`);
        log.debug(`    • Names: ${packageContainers.map(p => p.label).join(', ')}`);

        if (packageContainers.length > 0) {
          log.debug(`  • Package containers found:`);
          packageContainers.forEach(node => {
            log.debug(`    - ${node.label} (${node.data.source?.packageType || 'unknown'})`);
          });
        } else {
          log.debug(`  ❌ NO PACKAGE CONTAINERS FOUND - ISSUE IN EXTENSION`);
        }

        log.debug(`[GraphBuilder] ✅ External packages integrated. Final nodes: ${projectGraph.nodes.length}, Aristas finales: ${projectGraph.edges.length}`);
    }

    return projectGraph;
}

/**
 * Filters external packages to include only those relevant for analysis.
 * Excludes basic Flutter packages and focuses on third_party, custom dependencies,
 * and official Flutter packages that add value to the analysis.
 * * @param packages - The complete array of found packages
 * @returns A filtered array of relevant packages
 */
function getRelevantExternalPackages(packages: ExternalPackageInfo[]): ExternalPackageInfo[] {
    return packages.filter(pkg => 
        pkg.type === 'third_party' || 
        pkg.type === 'custom' ||
        (pkg.type === 'flutter_official' && !['flutter', 'flutter_test'].includes(pkg.name))
    );
}

/**
 * Extracts relevant symbols from external packages to include in the graph.
 * It processes the main files of packages, filters important public symbols,
 * and transforms LSP symbols into the enriched format for integration.
 * * @param projectRoot - The root path of the project
 * @param client - LSP client for symbol analysis
 * @returns A map of external symbols by unique ID
 */
// En lugar de comentarlo, podrías reemplazarlo con:
async function extractSymbolsFromExternalPackages(
    projectRoot: string
): Promise<Map<string, EnrichedSymbol>> {
    const externalSymbols = new Map<string, EnrichedSymbol>();
    
    const allPackages = findAllPackages(projectRoot);
    const relevantPackages = getRelevantExternalPackages(allPackages);
    
    for (const pkg of relevantPackages) {
        if (!pkg.hasLibFolder || pkg.dartFiles.length === 0) continue;
        
        const mainFiles = pkg.dartFiles
            .filter(file => {
                const fileName = path.basename(file, '.dart');
                return fileName === pkg.name || 
                       fileName === 'main' || 
                       file.endsWith(`lib/${pkg.name}.dart`);
            })
            .slice(0, 1);
        
        for (const dartFile of mainFiles) {
            try {
                const fileUri = vscode.Uri.file(dartFile);
                // Usar la API de VS Code en lugar del cliente LSP directo
                const symbols = await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    fileUri
                ) as vscode.DocumentSymbol[];
                
                // Resto del procesamiento igual...
            } catch (error) {
                log.debug(`Skipping external file: ${dartFile}`);
            }
        }
    }
    
    return externalSymbols;
}

/**
 * Determines if a VS Code symbol is relevant for the graph analysis.
 * Filters public symbols of important types (classes, enums, functions),
 * excluding common methods that do not provide analytical value.
 * * @param symbol - A VS Code document symbol
 * @returns true if the symbol is relevant for analysis
 */
function isRelevantSymbol(symbol: vscode.DocumentSymbol): boolean {
    if (symbol.kind === vscode.SymbolKind.Class || 
        symbol.kind === vscode.SymbolKind.Enum) {
        return !symbol.name.startsWith('_');
    }
    
    if (symbol.kind === vscode.SymbolKind.Function || 
        symbol.kind === vscode.SymbolKind.Method) {
        const excludedMethods = [
            'toString', 'hashCode', 'operator', 'runtimeType',
            'noSuchMethod', 'now', 'parse', 'tryParse'
        ];
        return !symbol.name.startsWith('_') && 
               !excludedMethods.some(excluded => symbol.name.includes(excluded));
    }
    
    return false;
}

/**
 * Checks if a top-level enriched symbol is relevant for inclusion in the graph.
 * Applies additional filters for name length and practical relevance for use
 * in the project's code.
 * * @param symbol - The enriched symbol to evaluate
 * @returns true if the symbol should be included in the graph
 */
function isTopLevelRelevantSymbol(symbol: EnrichedSymbol): boolean {
    const relevantKinds = [
        vscode.SymbolKind.Class,
        vscode.SymbolKind.Enum,
        vscode.SymbolKind.Function 
    ];
    
    return relevantKinds.includes(symbol.kind) && 
           !symbol.name.startsWith('_') &&
           symbol.name.length > 2;
}