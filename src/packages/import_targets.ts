import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Directory with the public libraries of every package listed in a `package_config.json`
 * (`name` -> absolute `lib` folder). Relative `rootUri` values are resolved against the folder of the config file.
 */
export function readPackageLibDirs(packageConfigJson: string, configDir: string): Record<string, string> {
    const result: Record<string, string> = {};
    let config: { packages?: Array<{ name?: string; rootUri?: string; packageUri?: string }> };
    try {
        config = JSON.parse(packageConfigJson);
    } catch {
        return result;
    }
    for (const pkg of config.packages ?? []) {
        if (!pkg.name || !pkg.rootUri) { continue; }
        try {
            const root = pkg.rootUri.startsWith('file:')
                ? fileURLToPath(pkg.rootUri)
                : path.resolve(configDir, decodeURIComponent(pkg.rootUri));
            result[pkg.name] = path.resolve(root, pkg.packageUri ?? 'lib');
        } catch {
            // an unreadable entry only means that package cannot be opened
        }
    }
    return result;
}

/** The `lib` folder of a Dart SDK found in one of the candidate folders, or undefined. */
export function findSdkLibDir(candidates: string[], exists: (p: string) => boolean = fs.existsSync): string | undefined {
    for (const candidate of candidates) {
        const lib = path.join(candidate, 'lib');
        if (exists(path.join(lib, 'core', 'core.dart'))) { return lib; }
    }
    return undefined;
}

/**
 * Source file behind an import URI. `package:` URIs are looked up in the packages' lib folders and `dart:` URIs
 * in the SDK; `dart:ui` and other engine libraries that are not in the SDK folder stay unresolved.
 */
export function resolveImportFile(
    uri: string,
    libDirs: Record<string, string>,
    sdkLibDir: string | undefined,
    exists: (p: string) => boolean = fs.existsSync
): string | undefined {
    const dart = /^dart:(\w+)$/.exec(uri);
    if (dart) {
        if (!sdkLibDir) { return undefined; }
        const file = path.join(sdkLibDir, dart[1], dart[1] + '.dart');
        return exists(file) ? file : undefined;
    }
    const pkg = /^package:([^/]+)\/(.+)$/.exec(uri);
    if (pkg && libDirs[pkg[1]]) {
        const file = path.join(libDirs[pkg[1]], pkg[2]);
        return exists(file) ? file : undefined;
    }
    return undefined;
}
