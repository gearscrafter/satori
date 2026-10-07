import * as path from 'path';

/**
 * The real `dart` program for a path found on the PATH or configured by the user.
 *
 * With Flutter the command on the PATH is a launcher script (`flutter/bin/dart`, `dart.bat`) that finds the SDK and
 * starts the real executable. Starting a server through a script costs a shell and an extra process that is hard to
 * stop, so when the SDK that belongs to the launcher is next to it, that one is used.
 */
export function realDartExecutable(found: string, exists: (file: string) => boolean, platform: string = process.platform): string {
    const exe = platform === 'win32' ? 'dart.exe' : 'dart';
    const base = path.basename(found).toLowerCase();
    const isLauncher = /\.(bat|cmd|sh)$/.test(base) || path.basename(path.dirname(found)).toLowerCase() === 'bin' && base === 'dart' && exists(path.join(path.dirname(found), 'cache', 'dart-sdk', 'bin', exe));
    if (!isLauncher) {
        return found;
    }
    const fromFlutter = path.join(path.dirname(found), 'cache', 'dart-sdk', 'bin', exe);
    return exists(fromFlutter) ? fromFlutter : found;
}

/** The first line that names an existing file, from the output of `where dart` / `which dart` (it can list several). */
export function firstExistingPath(output: string, exists: (file: string) => boolean): string | undefined {
    return output.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '').find(exists);
}
