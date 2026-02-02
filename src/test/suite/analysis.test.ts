import * as assert from 'assert';
import * as vscode from 'vscode';
import { transformLspSymbols } from '../../analysis/symbol_transformer';
import { determineFileSource } from '../../packages/source_detector';
import { extractPackageImportsFromFile } from '../../packages/package_files';
import { ExternalPackageInfo } from '../../types/index';

suite('Analysis Functions Test Suite', () => {

    test('transformLspSymbols should transform basic class symbol', () => {
        const mockLspSymbol: vscode.DocumentSymbol = {
            name: 'TestClass',
            detail: 'class TestClass',
            kind: vscode.SymbolKind.Class,
            range: new vscode.Range(0, 0, 10, 0),
            selectionRange: new vscode.Range(0, 6, 0, 15),
            children: []
        };

        const fileUri = 'file:///test/TestClass.dart';
        const result = transformLspSymbols([mockLspSymbol], undefined, fileUri);

        assert.strictEqual(result.length, 1, 'Should return one transformed symbol');
        assert.strictEqual(result[0].name, 'TestClass', 'Should preserve name');
        assert.strictEqual(result[0].kind, vscode.SymbolKind.Class, 'Should preserve kind');
        assert.ok(result[0].uniqueId, 'Should generate unique ID');
    });

    test('transformLspSymbols should handle nested symbols', () => {
        const mockMethod: vscode.DocumentSymbol = {
            name: 'testMethod',
            detail: 'void testMethod()',
            kind: vscode.SymbolKind.Method,
            range: new vscode.Range(2, 2, 4, 2),
            selectionRange: new vscode.Range(2, 7, 2, 17),
            children: []
        };

        const mockClass: vscode.DocumentSymbol = {
            name: 'TestClass',
            detail: 'class TestClass',
            kind: vscode.SymbolKind.Class,
            range: new vscode.Range(0, 0, 10, 0),
            selectionRange: new vscode.Range(0, 6, 0, 15),
            children: [mockMethod]
        };

        const fileUri = 'file:///test/TestClass.dart';
        const result = transformLspSymbols([mockClass], undefined, fileUri);

        assert.strictEqual(result.length, 1, 'Should return one class symbol');
        assert.strictEqual(result[0].children?.length, 1, 'Class should have one child');
        assert.strictEqual(result[0].children?.[0].name, 'testMethod', 'Child should be the method');
        assert.ok(result[0].children?.[0].parentId, 'Child should have parent ID');
    });

    test('transformLspSymbols should handle empty input', () => {
        const result = transformLspSymbols([], undefined, 'file:///test/empty.dart');
        assert.strictEqual(result.length, 0, 'Should return empty array for empty input');
    });

    test('determineFileSource should identify project files', () => {
        const fileUri = 'file:///project/lib/main.dart';
        const packages: ExternalPackageInfo[] = [];
        
        const result = determineFileSource(fileUri, packages);
        
        assert.strictEqual(result.type, 'project', 'Should identify as project file');
    });

    test('determineFileSource should identify SDK files', () => {
        const fileUri = 'file:///dart-sdk/lib/core/string.dart';
        const packages: ExternalPackageInfo[] = [];
        
        const result = determineFileSource(fileUri, packages);
        
        assert.strictEqual(result.type, 'sdk', 'Should identify as SDK file');
        assert.strictEqual(result.packageType, 'sdk', 'Should have SDK package type');
    });

    test('determineFileSource should identify external packages', () => {
        const fileUri = 'file:///packages/http/lib/http.dart';
        const packages: ExternalPackageInfo[] = [
            {
                name: 'http',
                version: '1.0.0',
                path: '/packages/http',
                type: 'third_party',
                dartFiles: [],
                hasLibFolder: false,
                isFlutterPackage: false,
                description: ''
            }
        ];
        
        const result = determineFileSource(fileUri, packages);
        
        assert.strictEqual(result.type, 'external_package', 'Should identify as external package');
        assert.strictEqual(result.packageName, 'http', 'Should identify package name');
        assert.strictEqual(result.packageVersion, '1.0.0', 'Should identify package version');
    });

    test('determineFileSource should handle invalid URI', () => {
        const result = determineFileSource('', []);
        assert.strictEqual(result.type, 'project', 'Should default to project for invalid URI');
    });

    test('determineFileSource should handle custom packages as project', () => {
        const fileUri = 'file:///project/packages/my_package/lib/main.dart';
        const packages: ExternalPackageInfo[] = [
            {
                name: 'my_package',
                version: '1.0.0',
                path: '/project/packages/my_package',
                type: 'custom',
                dartFiles: [],
                hasLibFolder: false,
                isFlutterPackage: false,
                description: ''
            }
        ];
        
        const result = determineFileSource(fileUri, packages);
        
        assert.strictEqual(result.type, 'project', 'Custom packages should be treated as project');
    });

    test('extractPackageImportsFromFile should extract package names', () => {
        const mockFileContent = `
            import 'package:flutter/material.dart';
            import 'package:http/http.dart' as http;
            import 'dart:core';
            import 'package:provider/provider.dart';
            import './local_file.dart';
        `.trim();

        const originalReadFileSync = require('fs').readFileSync;
        require('fs').readFileSync = (path: string, encoding: string) => {
            if (path.includes('test_file.dart')) {
                return mockFileContent;
            }
            return originalReadFileSync(path, encoding);
        };

        try {
            const fileUri = 'file:///test/test_file.dart';
            const result = extractPackageImportsFromFile(fileUri);

            assert.ok(Array.isArray(result), 'Should return an array');
            assert.ok(result.includes('flutter'), 'Should extract flutter package');
            assert.ok(result.includes('http'), 'Should extract http package');
            assert.ok(result.includes('provider'), 'Should extract provider package');
            assert.ok(!result.includes('dart'), 'Should not include dart: imports');
        } finally {
            require('fs').readFileSync = originalReadFileSync;
        }
    });

    test('extractPackageImportsFromFile should handle file read errors', () => {
        const nonExistentUri = 'file:///nonexistent/file.dart';
        const result = extractPackageImportsFromFile(nonExistentUri);
        
        assert.ok(Array.isArray(result), 'Should return array even on error');
        assert.strictEqual(result.length, 0, 'Should return empty array on error');
    });

    test('extractPackageImportsFromFile should handle duplicate imports', () => {
        const mockFileContent = `
            import 'package:flutter/material.dart';
            import 'package:flutter/widgets.dart';
            import 'package:http/http.dart';
            import 'package:http/browser_client.dart';
        `.trim();

        const originalReadFileSync = require('fs').readFileSync;
        require('fs').readFileSync = (path: string, encoding: string) => {
            if (path.includes('test_duplicates.dart')) {
                return mockFileContent;
            }
            return originalReadFileSync(path, encoding);
        };

        try {
            const fileUri = 'file:///test/test_duplicates.dart';
            const result = extractPackageImportsFromFile(fileUri);

            const uniquePackages = new Set(result);
            assert.strictEqual(result.length, uniquePackages.size, 'Should not have duplicate packages');
            assert.ok(result.includes('flutter'), 'Should include flutter once');
            assert.ok(result.includes('http'), 'Should include http once');
        } finally {
            require('fs').readFileSync = originalReadFileSync;
        }
    });

    test('transformLspSymbols should handle symbols without children', () => {
        const mockSymbol: vscode.DocumentSymbol = {
            name: 'constantValue',
            detail: 'String constantValue',
            kind: vscode.SymbolKind.Constant,
            range: new vscode.Range(0, 0, 0, 20),
            selectionRange: new vscode.Range(0, 7, 0, 20),
            children: []
        };

        const result = transformLspSymbols([mockSymbol], undefined, 'file:///test/constants.dart');

        assert.strictEqual(result.length, 1, 'Should return one symbol');
        assert.strictEqual(result[0].name, 'constantValue', 'Should preserve name');
        assert.strictEqual(result[0].kind, vscode.SymbolKind.Constant, 'Should preserve kind');
        assert.ok(!result[0].children || result[0].children.length === 0, 'Should not have children');
    });
});