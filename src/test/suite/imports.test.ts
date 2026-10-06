import * as assert from 'assert';
import { parseImports, parsePubspecName } from '../../analysis/imports';

suite('Imports Test Suite', () => {
    test('reads import and export directives with their line and column', () => {
        const src = [
            "import 'dart:async';",
            '',
            'import "package:dio/dio.dart" as dio;',
            "export '../models/user.dart';",
            "  import 'package:flutter/material.dart' show Widget;"
        ].join('\n');
        assert.deepStrictEqual(parseImports(src), [
            { uri: 'dart:async', line: 0, column: 8 },
            { uri: 'package:dio/dio.dart', line: 2, column: 8 },
            { uri: '../models/user.dart', line: 3, column: 8 },
            { uri: 'package:flutter/material.dart', line: 4, column: 10 }
        ]);
    });

    test('ignores comments, part directives and code that only mentions import', () => {
        const src = [
            "// import 'package:old/old.dart';",
            "part 'user.g.dart';",
            "part of 'user.dart';",
            "final text = 'import x';",
            "import 'package:real/real.dart';"
        ].join('\n');
        assert.deepStrictEqual(parseImports(src).map(i => i.uri), ['package:real/real.dart']);
    });

    test('handles Windows line endings and empty input', () => {
        assert.deepStrictEqual(parseImports("import 'a.dart';\r\nimport 'b.dart';\r\n").map(i => i.line), [0, 1]);
        assert.deepStrictEqual(parseImports(''), []);
    });

    test('reads the package name from a pubspec', () => {
        assert.strictEqual(parsePubspecName('name: my_app\nversion: 1.0.0\n'), 'my_app');
        assert.strictEqual(parsePubspecName("name: 'my_app' # comment\n"), 'my_app');
        assert.strictEqual(parsePubspecName('description: x\ndependencies:\n  name: nope\n'), '');
        assert.strictEqual(parsePubspecName(''), '');
    });
});
