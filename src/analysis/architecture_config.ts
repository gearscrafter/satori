import { globToRegExp } from '../filesystem/exclusions';
import { PRESETS, mergeLayers, layersFromFolders } from './architecture_presets';

/**
 * The architecture of a project: which layers it has, how a class is placed in one, and which dependencies between
 * layers are allowed. It lives in `satori.json` at the root of the project (under "architecture"), so a team shares
 * it through the repository. Without the file the four layers Satori always had are used.
 */

export interface LayerSpec {
    id: string;
    label?: string;
    description?: string;
    /** `#rrggbb`. Without it a colour of the palette is taken by position. */
    color?: string;
    /** One of the icons of the diagram, for example `layer-view`. */
    icon?: string;
    /** Placed by where the file is: globs relative to the project, such as `lib/presentation/**`. */
    folders?: string[];
    /** Placed by what the class extends, implements or mixes in. */
    extends?: string[];
    /** Placed by the name of the class: `*Page` (ends with), `Base*` (starts with), `*Repo*` (contains). */
    names?: string[];
    /** A layer that takes no part in the rules (utilities, core code). Libraries are placed here too. */
    neutral?: boolean;
}

/** "none" applies no rule at all: layers are only a way to group the classes. */
export type RuleMode = 'order' | 'allow' | 'none';

export interface Architecture {
    layers: LayerSpec[];
    mode: RuleMode;
    allow: [string, string][];
    forbid: [string, string][];
    /** The layer that takes no part in the rules, always present. */
    neutral: string;
    /** Classes placed by hand, by class name. */
    overrides: Record<string, string>;
    /** Maps what Satori's own guess says (view, state, service, model, utility) to a layer of this architecture. */
    heuristic: Record<string, string>;
    /** True for the architecture used when there is no file. */
    builtin: boolean;
}

export const BUILTIN_LAYER_IDS = ['view', 'state', 'service', 'model', 'utility'];

export function defaultArchitecture(): Architecture {
    return {
        layers: [
            { id: 'view' }, { id: 'state' }, { id: 'service' }, { id: 'model' }, { id: 'utility', neutral: true }
        ],
        mode: 'order',
        allow: [],
        forbid: [],
        neutral: 'utility',
        overrides: {},
        heuristic: { view: 'view', state: 'state', service: 'service', model: 'model', utility: 'utility' },
        builtin: true
    };
}

export const KNOWN_ICONS = ['layer-view', 'layer-state', 'layer-service', 'layer-model', 'layer-utility', 'layer-generic'];
const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export interface ParseResult {
    architecture: Architecture;
    /** What was wrong or ignored, in words the person who wrote the file can act on. */
    problems: string[];
}

function strings(value: unknown): string[] | undefined {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : undefined;
}

function pairs(value: unknown, known: Set<string>, what: string, problems: string[]): [string, string][] {
    const out: [string, string][] = [];
    if (value === undefined) { return out; }
    if (!Array.isArray(value)) { problems.push(`"${what}" must be a list of [from, to] pairs.`); return out; }
    for (const item of value) {
        if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string') {
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

/**
 * Reads the contents of `satori.json`. Anything wrong is reported and left out instead of stopping the analysis, so
 * a typo in the file never leaves the person without a diagram.
 */
/** What the preset "folders" needs to know about the project, asked only when it is used. */
export interface ParseContext {
    discoverFolders?: () => { base: string; folders: string[] };
}

export function parseArchitecture(text: string | undefined, context: ParseContext = {}): ParseResult {
    if (text === undefined || text.trim() === '') { return { architecture: defaultArchitecture(), problems: [] }; }
    let raw: any;
    try { raw = JSON.parse(text); } catch (e: any) {
        return { architecture: defaultArchitecture(), problems: [`satori.json is not valid JSON (${e.message}). The default layers are used.`] };
    }
    const section = raw && typeof raw === 'object' ? raw.architecture : undefined;
    if (section === undefined) { return { architecture: defaultArchitecture(), problems: [] }; }
    if (!section || typeof section !== 'object') {
        return { architecture: defaultArchitecture(), problems: ['"architecture" must be an object. The default layers are used.'] };
    }

    const problems: string[] = [];
    // A preset is the starting point; the layers and rules of the file are merged into it.
    let rawLayers: any[] = Array.isArray(section.layers) ? section.layers : [];
    let presetRules: { mode?: RuleMode; allow?: [string, string][] } = {};
    let presetHeuristic: Record<string, string> | undefined;
    if (section.preset === 'folders') {
        const found = context.discoverFolders?.();
        if (!found || found.folders.length === 0) {
            problems.push('"preset": "folders" needs a lib/ folder with subfolders, and none was found.');
        } else {
            rawLayers = mergeLayers(layersFromFolders(found.base, found.folders), rawLayers);
            presetRules = { mode: 'none', allow: [] };
            presetHeuristic = {};
        }
    } else if (section.preset !== undefined) {
        const preset = typeof section.preset === 'string' ? PRESETS[section.preset] : undefined;
        if (!preset) {
            problems.push(`"preset" must be one of: ${[...Object.keys(PRESETS), 'folders'].join(', ')} (got ${JSON.stringify(section.preset)}).`);
        } else {
            rawLayers = mergeLayers(preset.layers, rawLayers);
            presetRules = { mode: preset.mode, allow: preset.allow };
            presetHeuristic = preset.heuristic;
        }
    }
    if (rawLayers.length === 0) {
        return { architecture: defaultArchitecture(), problems: [...problems, '"architecture.layers" must be a list with at least one layer, or "architecture.preset" must name one. The default layers are used.'] };
    }

    const layers: LayerSpec[] = [];
    const seen = new Set<string>();
    for (const item of rawLayers) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !ID.test(item.id)) {
            problems.push(`A layer needs an "id" of lowercase letters, digits, "-" or "_" (got ${JSON.stringify(item && item.id)}).`);
            continue;
        }
        if (seen.has(item.id)) { problems.push(`The layer "${item.id}" is written twice; the second one is ignored.`); continue; }
        seen.add(item.id);
        const spec: LayerSpec = { id: item.id };
        if (typeof item.label === 'string') { spec.label = item.label; }
        if (typeof item.description === 'string') { spec.description = item.description; }
        if (typeof item.color === 'string') {
            if (COLOR.test(item.color)) { spec.color = item.color.toLowerCase(); } else { problems.push(`The colour of "${item.id}" must look like #1e88e5.`); }
        }
        if (typeof item.icon === 'string') {
            if (KNOWN_ICONS.includes(item.icon)) { spec.icon = item.icon; } else { problems.push(`The icon of "${item.id}" must be one of: ${KNOWN_ICONS.join(', ')}.`); }
        }
        const folders = strings(item.folders); if (folders) { spec.folders = folders; }
        const ext = strings(item.extends); if (ext) { spec.extends = ext; }
        const names = strings(item.names); if (names) { spec.names = names; }
        if (item.neutral === true) { spec.neutral = true; }
        layers.push(spec);
    }
    if (layers.length === 0) {
        return { architecture: defaultArchitecture(), problems: [...problems, 'No valid layer was found. The default layers are used.'] };
    }

    // One layer takes no part in the rules and receives what nothing else claims: the first one marked, or "other".
    let neutral = layers.find(l => l.neutral)?.id;
    if (!neutral) {
        const existing = layers.find(l => l.id === 'other');
        if (existing) { existing.neutral = true; } else { layers.push({ id: 'other', label: 'Other', neutral: true }); seen.add('other'); }
        neutral = 'other';
    }
    layers.forEach(l => { if (l.id !== neutral) { delete l.neutral; } });

    const known = new Set(layers.map(l => l.id));
    const fileRules = section.rules && typeof section.rules === 'object' ? section.rules : {};
    // What the file says about the rules replaces what the preset says, key by key.
    const rules = { ...presetRules, ...fileRules };
    let mode: RuleMode = 'order';
    if (rules.mode === 'allow' || rules.mode === 'none') { mode = rules.mode; }
    else if (rules.mode !== undefined && rules.mode !== 'order') { problems.push('"rules.mode" must be "order", "allow" or "none"; "order" is used.'); }

    const overrides: Record<string, string> = {};
    if (section.overrides && typeof section.overrides === 'object') {
        for (const [name, layer] of Object.entries(section.overrides)) {
            if (typeof layer === 'string' && known.has(layer)) { overrides[name] = layer; }
            else { problems.push(`"overrides" puts ${name} in a layer that does not exist (${String(layer)}).`); }
        }
    }

    // Satori's own guess, mapped onto this architecture. With no map, the layers that carry its names keep working.
    const heuristic: Record<string, string> = {};
    if (section.heuristic === false) {
        // switched off: classes that match nothing go to the neutral layer
    } else if (section.heuristic && typeof section.heuristic === 'object') {
        for (const [from, to] of Object.entries(section.heuristic)) {
            if (!BUILTIN_LAYER_IDS.includes(from)) { problems.push(`"heuristic" does not know "${from}"; use view, state, service, model or utility.`); }
            else if (typeof to === 'string' && known.has(to)) { heuristic[from] = to; }
            else { problems.push(`"heuristic" sends ${from} to a layer that does not exist (${String(to)}).`); }
        }
    } else if (presetHeuristic) {
        for (const [from, to] of Object.entries(presetHeuristic)) { if (known.has(to)) { heuristic[from] = to; } }
    } else {
        for (const id of BUILTIN_LAYER_IDS) { if (known.has(id)) { heuristic[id] = id; } }
    }

    return {
        architecture: {
            layers, mode,
            allow: pairs(rules.allow, known, 'rules.allow', problems),
            forbid: pairs(rules.forbid, known, 'rules.forbid', problems),
            neutral, overrides, heuristic, builtin: false
        },
        problems
    };
}

function namePattern(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}

export interface ClassFacts {
    name: string;
    /** Path of the file relative to the project, written with forward slashes. */
    path: string;
    /** Names of what the class extends, implements or mixes in, without generics. */
    parents: string[];
    /** What Satori's own guess says: view, state, service, model or utility. */
    guess: string;
}

/**
 * The layer of a class. Placed by hand first, then by folder, by what it extends and by its name (a place in the
 * code says more than a name), then by Satori's own guess when the architecture keeps it, and last in the neutral layer.
 */
export function layerFor(arch: Architecture, facts: ClassFacts): string {
    const byName = arch.overrides[facts.name];
    if (byName) { return byName; }
    const path = facts.path.replace(/\\/g, '/');

    for (const layer of arch.layers) {
        if ((layer.folders ?? []).some(g => globToRegExp(g).test(path))) { return layer.id; }
    }
    for (const layer of arch.layers) {
        if ((layer.extends ?? []).some(e => facts.parents.includes(e))) { return layer.id; }
    }
    for (const layer of arch.layers) {
        if ((layer.names ?? []).some(p => namePattern(p).test(facts.name))) { return layer.id; }
    }
    return arch.heuristic[facts.guess] ?? arch.neutral;
}
