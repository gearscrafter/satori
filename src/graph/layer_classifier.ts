import * as vscode from 'vscode';
import { EnrichedSymbol, TypeReference } from '../types/index';

/**
 * Determines the architectural layer of a symbol based on hierarchical pattern
 * analysis. It evaluates inheritance relationships, class names, present methods,
 * and code structure to classify it into view, state, service, model, utility,
 * or member according to clean architecture principles.
 * * @param symbol - The enriched symbol to classify.
 * @param relations - The inheritance and implementation relationships of the symbol.
 * @returns The assigned architectural layer.
 */
export function getArchitecturalLayer(
    symbol: EnrichedSymbol, 
    relations: { extends?: (string|TypeReference)[]; with?: (string|TypeReference)[], implements?: (string|TypeReference)[] } | undefined
): 'view' | 'state' | 'service' | 'model' | 'utility' | 'member' {
    
    // Early return for non-class/enum symbols
    if (symbol.kind !== vscode.SymbolKind.Class && symbol.kind !== vscode.SymbolKind.Enum) {
        return 'member';
    }

    const name = symbol.name.toLowerCase();
    const allRelations = [
        ...(relations?.extends || []),
        ...(relations?.implements || []),
        ...(relations?.with || [])
    ].map(r => (typeof r === 'string' ? r : r.name).toLowerCase().split('<')[0]);

    // =================================================================
    // 🎨 VIEW LAYER DETECTION (Hierarchical Priority)
    // =================================================================
    
    if (allRelations.includes('statelesswidget') || 
        allRelations.includes('statefulwidget') || 
        allRelations.includes('hookwidget') ||
        allRelations.includes('widget')) {
        return 'view';
    }

    if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        const hasBuildMethod = symbol.children.some(c => 
            c.kind === vscode.SymbolKind.Method && c.name === 'build'
        );
        if (hasBuildMethod) {
            return 'view';
        }
    }

    if (allRelations.some(rel => 
        rel.includes('widget') || 
        rel.includes('component') ||
        rel.includes('renderobject') ||
        rel.includes('sliver')
    )) {
        return 'view';
    }

    if (name.endsWith('page') || name.endsWith('screen') || 
        name.endsWith('view') || name.endsWith('widget') ||
        name.endsWith('dialog') || name.endsWith('modal') ||
        name.endsWith('bottomsheet') || name.endsWith('drawer')) {
        return 'view';
    }

    if (name.includes('page') || name.includes('screen') || 
        name.includes('widget') || name.includes('dialog')) {
        return 'view';
    }

    // =================================================================
    // 🧠 STATE LAYER DETECTION (Hierarchical Priority) 
    // =================================================================

    if (allRelations.includes('changenotifier') || 
        allRelations.includes('statenotifier') ||
        allRelations.includes('bloc') ||
        allRelations.includes('cubit') ||
        allRelations.includes('provider') ||
        allRelations.includes('controller')) {
        return 'state';
    }

    if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        const hasStateStream = symbol.children.some(c => 
            (c.kind === vscode.SymbolKind.Field || c.kind === vscode.SymbolKind.Property) && 
            (c.name === 'stream' || c.name === 'state')
        );
        const hasEventMethod = symbol.children.some(c => 
            c.kind === vscode.SymbolKind.Method && 
            (c.name === 'add' || c.name === 'emit' || c.name === 'on')
        );

        if (hasStateStream && hasEventMethod) {
            return 'state';
        }
    }

    if (name.endsWith('bloc') || name.endsWith('cubit') || 
        name.endsWith('provider') || name.endsWith('controller') || 
        name.endsWith('manager') || name.endsWith('viewmodel') ||
        name.endsWith('notifier') || name.endsWith('store') ||
        name.endsWith('reducer') || name.endsWith('state')) {
        return 'state';
    }

    if (name.includes('bloc') || name.includes('cubit') || 
        name.includes('provider') || name.includes('controller') ||
        name.includes('notifier') || name.includes('state')) {
        return 'state';
    }

    // =================================================================
    // 🌐 SERVICE LAYER DETECTION (Hierarchical Priority)
    // =================================================================

    if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        const methods = symbol.children.filter(c => c.kind === vscode.SymbolKind.Method);
        const asyncMethods = methods.filter(m => 
            m.returnType?.toLowerCase().includes('future') ||
            m.returnType?.toLowerCase().includes('stream') ||
            m.name.toLowerCase().includes('async')
        );
        
        if (methods.length > 0 && (asyncMethods.length / methods.length) >= 0.5) {
            return 'service';
        }
    }

    if (allRelations.some(rel => 
        rel.includes('service') || 
        rel.includes('repository') ||
        rel.includes('client') ||
        rel.includes('adapter') ||
        rel.includes('gateway')
    )) {
        return 'service';
    }

    if (name.endsWith('service') || name.endsWith('repository') || 
        name.endsWith('api') || name.endsWith('datasource') ||
        name.endsWith('client') || name.endsWith('gateway') ||
        name.endsWith('adapter') || name.endsWith('helper') ||
        name.endsWith('manager') || name.endsWith('handler')) {
        return 'service';
    }

    if (name.includes('service') || name.includes('repository') || 
        name.includes('api') || name.includes('client') ||
        name.includes('gateway') || name.includes('adapter')) {
        return 'service';
    }

    // =================================================================
    // 📦 MODEL LAYER DETECTION (Hierarchical Priority)
    // =================================================================

    if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        const methods = symbol.children.filter(c => c.kind === vscode.SymbolKind.Method);
        const fields = symbol.children.filter(c => 
            c.kind === vscode.SymbolKind.Field || c.kind === vscode.SymbolKind.Property
        );
        
        const businessMethods = methods.filter(m => 
            !['toString', 'hashcode', 'operator==', 'copyWith', 'toJson', 'fromJson'].includes(m.name.toLowerCase())
        );
        
        if (fields.length > 0 && businessMethods.length <= 2) {
            return 'model';
        }
    }

    if (name.endsWith('model') || name.endsWith('entity') || 
        name.endsWith('dto') || name.endsWith('data') ||
        name.endsWith('response') || name.endsWith('request') ||
        name.endsWith('event') || name.endsWith('state') ||
        name.endsWith('vo') || name.endsWith('pojo')) {
        return 'model';
    }

    if (name.includes('model') || name.includes('entity') || 
        name.includes('dto') || name.includes('data')) {
        return 'model';
    }

    if (symbol.kind === vscode.SymbolKind.Enum) {
        return 'model';
    }

    // =================================================================
    // 🛠️ UTILITY LAYER DETECTION (Default catch-all)
    // =================================================================

    // Utility patterns
    if (name.endsWith('util') || name.endsWith('utils') || 
        name.endsWith('helper') || name.endsWith('extension') ||
        name.endsWith('mixin') || name.endsWith('constants') ||
        name.endsWith('config') || name.endsWith('settings')) {
        return 'utility';
    }

    // Static utility classes (many static methods)
    if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        const methods = symbol.children.filter(c => c.kind === vscode.SymbolKind.Method);
        const staticMethods = methods.filter(m => 
            m.detail?.toLowerCase().includes('static')
        );
        
        if (methods.length > 0 && (staticMethods.length / methods.length) >= 0.7) {
            return 'utility';
        }
    }

    // =================================================================
    // DEFAULT FALLBACK
    // =================================================================
    return 'utility';
}