import type { LayerSpec, RuleMode } from './architecture_config';

/**
 * Architectures ready to use: `{ "architecture": { "preset": "clean" } }` is a complete satori.json.
 *
 * Folders are written to match at any depth (`**\/presentation/**`), so they work with `lib/src/`, with a folder per
 * feature (`lib/features/login/presentation/`) and inside a monorepo. Only folder names that mean one thing are used;
 * for the rest, names and Satori's own guess place the class. A preset is only a starting point: whatever the file
 * adds is merged into it (see mergeLayers) and its rules can be replaced.
 */
export interface Preset {
    description: string;
    layers: LayerSpec[];
    mode: RuleMode;
    allow: [string, string][];
    heuristic: Record<string, string>;
}

const COMMON_NEUTRAL: LayerSpec = {
    id: 'core', label: 'Core', neutral: true,
    description: 'Shared code. Takes no part in the rules.',
    folders: ['**/core/**', '**/utils/**', '**/shared/**', '**/common/**', '**/helpers/**']
};

export const PRESETS: Record<string, Preset> = {
    // The four layers Satori always had, written out so they can be extended.
    default: {
        description: 'View, State, Service and Model, placed by Satori\'s own guess. Using a layer above yours is a violation.',
        layers: [{ id: 'view' }, { id: 'state' }, { id: 'service' }, { id: 'model' }, { id: 'utility', neutral: true }],
        mode: 'order',
        allow: [],
        heuristic: { view: 'view', state: 'state', service: 'service', model: 'model', utility: 'utility' }
    },

    // Presentation and data both depend on the domain; the domain depends on nothing.
    clean: {
        description: 'Clean Architecture: presentation and data depend on the domain, the domain on nothing.',
        layers: [
            {
                id: 'presentation', label: 'Presentation', color: '#1e88e5', icon: 'layer-view',
                description: 'Screens, widgets and their state. May use the domain, never the data layer directly.',
                folders: ['**/presentation/**', '**/pages/**', '**/screens/**', '**/views/**', '**/widgets/**', '**/ui/**'],
                names: ['*Page', '*Screen', '*View']
            },
            {
                id: 'domain', label: 'Domain', color: '#8e24aa',
                description: 'Entities and business rules. Depends on nothing else.',
                folders: ['**/domain/**', '**/entities/**', '**/usecases/**', '**/use_cases/**'],
                names: ['*UseCase', '*Entity']
            },
            {
                id: 'data', label: 'Data', color: '#43a047', icon: 'layer-model',
                description: 'Repositories, data sources and DTOs. May use the domain.',
                folders: ['**/data/**', '**/repositories/**', '**/datasources/**', '**/data_sources/**'],
                names: ['*Repository*', '*DataSource*', '*Dto']
            },
            COMMON_NEUTRAL
        ],
        mode: 'allow',
        allow: [['presentation', 'domain'], ['data', 'domain']],
        heuristic: { view: 'presentation', state: 'presentation', service: 'data', model: 'domain', utility: 'core' }
    },

    // View -> view model -> model, one way.
    mvvm: {
        description: 'MVVM: views use view models, view models use the model. Never the other way round.',
        layers: [
            {
                id: 'view', label: 'View', color: '#1e88e5', icon: 'layer-view',
                description: 'Screens and widgets. Show what the view model exposes.',
                folders: ['**/views/**', '**/pages/**', '**/screens/**', '**/widgets/**', '**/ui/**'],
                extends: ['StatelessWidget', 'StatefulWidget'],
                names: ['*Page', '*Screen', '*View']
            },
            {
                id: 'viewmodel', label: 'View model', color: '#fbc02d', icon: 'layer-state',
                description: 'State and logic of a screen. Uses the model, knows nothing of widgets.',
                folders: ['**/viewmodels/**', '**/view_models/**', '**/viewmodel/**', '**/blocs/**', '**/cubits/**', '**/controllers/**', '**/providers/**', '**/state/**'],
                names: ['*ViewModel', '*Bloc', '*Cubit', '*Controller', '*Notifier']
            },
            {
                id: 'model', label: 'Model', color: '#e64a19', icon: 'layer-model',
                description: 'Data, repositories and services.',
                folders: ['**/models/**', '**/repositories/**', '**/services/**', '**/data/**', '**/domain/**'],
                names: ['*Model', '*Repository*', '*Service']
            },
            COMMON_NEUTRAL
        ],
        mode: 'order',
        allow: [],
        heuristic: { view: 'view', state: 'viewmodel', service: 'model', model: 'model', utility: 'core' }
    }
};

const LIST_KEYS: ('folders' | 'names' | 'extends')[] = ['folders', 'names', 'extends'];

/**
 * The layers of a preset with what the file says on top. A layer of the file with the id of one of the preset takes
 * its labels and colours and adds its folders, names and extends to the preset's; one with a new id is added before
 * the neutral layer, so it takes part in the rules like the others.
 */
export function mergeLayers(base: LayerSpec[], extra: any[]): LayerSpec[] {
    const merged = base.map(l => ({ ...l }));
    const neutralAt = merged.findIndex(l => l.neutral);
    for (const item of extra) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string') { continue; }
        const existing = merged.find(l => l.id === item.id);
        if (!existing) {
            const at = neutralAt >= 0 ? merged.findIndex(l => l.neutral) : merged.length;
            merged.splice(at, 0, { ...item });
            continue;
        }
        for (const [key, value] of Object.entries(item)) {
            if ((LIST_KEYS as string[]).includes(key) && Array.isArray(value)) {
                const current = (existing as any)[key] as string[] | undefined;
                (existing as any)[key] = [...value, ...(current ?? [])];
            } else {
                (existing as any)[key] = value;
            }
        }
    }
    return merged;
}

/** Where a folder sits in the usual flow of an app, from the screen down to the data: only used to order the layers. */
const ROLES: { rank: number; names: RegExp }[] = [
    { rank: 0, names: /^(views?|pages?|screens?|ui|widgets?|presentation|components?)$/ },
    { rank: 1, names: /^(view_?models?|blocs?|cubits?|controllers?|providers?|state|states|stores?|notifiers?)$/ },
    { rank: 2, names: /^(use_?cases?|domain|logic|business|services?|interactors?)$/ },
    { rank: 3, names: /^(repositor(y|ies)|data|data_?sources?|api|network|remote|local|infra(structure)?)$/ },
    { rank: 4, names: /^(models?|entit(y|ies)|dtos?)$/ }
];
/** Folders that hold shared code: they go together into the one layer that takes no part in the rules. */
const NEUTRAL_NAMES = /^(core|utils?|shared|common|helpers?|config|configs?|constants?|extensions?|theme|themes?|l10n|generated|assets|routes?|router|di|injection|mixins?)$/;
const UNKNOWN_RANK = 2.5;
const MAX_LAYERS = 12;

function layerId(name: string): string {
    const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '');
    return id === '' ? 'folder' : id.slice(0, 32);
}

function layerLabel(name: string): string {
    const words = name.replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * One layer per folder of the project, so nothing has to be written: `lib/views` becomes "Views", `lib/services`
 * "Services". The layers are ordered by what the folder usually holds (screens, state, logic, data, models), the shared
 * folders (core, utils...) go together into the neutral layer, and a layer is made of exactly that folder.
 * No rule is applied until the file asks for one (`"rules": { "mode": "order" }` uses the order shown).
 */
export function layersFromFolders(base: string, folders: string[]): LayerSpec[] {
    const used = new Set<string>(['core']);
    const own: { spec: LayerSpec; rank: number; name: string }[] = [];
    const shared: string[] = [];
    for (const name of [...new Set(folders)].sort()) {
        if (name.startsWith('.')) { continue; }
        const lower = name.toLowerCase();
        if (NEUTRAL_NAMES.test(lower)) { shared.push(`${base}/${name}/**`); continue; }
        if (own.length >= MAX_LAYERS) { shared.push(`${base}/${name}/**`); continue; }
        let id = layerId(name);
        for (let i = 2; used.has(id); i++) { id = `${layerId(name).slice(0, 28)}-${i}`; }
        used.add(id);
        const role = ROLES.find(r => r.names.test(lower));
        own.push({ spec: { id, label: layerLabel(name), folders: [`${base}/${name}/**`] }, rank: role ? role.rank : UNKNOWN_RANK, name });
    }
    own.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return [
        ...own.map(o => o.spec),
        { id: 'core', label: 'Core', neutral: true, description: 'Shared code and whatever is outside the folders above. Takes no part in the rules.', folders: shared }
    ];
}
