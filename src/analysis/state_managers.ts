/**
 * Recognises the state management approach of a class from what it extends, implements or mixes in.
 * Only what the declaration says is used, so a class that holds state without extending one of these bases
 * (a plain class registered with get_it, a Riverpod provider written as a function) is not recognised.
 */
export type StateFamily = 'bloc' | 'provider' | 'riverpod' | 'getx';

export interface StateManager {
    family: StateFamily;
    /** The base class that gave it away, as written in the declaration (`Cubit`, `ChangeNotifier`...). */
    base: string;
}

/** Lowercase base class name (without generics) -> family. */
const BASES: Record<string, StateFamily> = {
    bloc: 'bloc',
    cubit: 'bloc',
    hydratedbloc: 'bloc',
    hydratedcubit: 'bloc',
    replaybloc: 'bloc',
    replaycubit: 'bloc',
    changenotifier: 'provider',
    valuenotifier: 'provider',
    statenotifier: 'riverpod',
    notifier: 'riverpod',
    asyncnotifier: 'riverpod',
    autodisposenotifier: 'riverpod',
    autodisposeasyncnotifier: 'riverpod',
    getxcontroller: 'getx',
    getxservice: 'getx',
    rxcontroller: 'getx'
};

type Relation = string | { name: string };

export function detectStateManager(
    relations: { extends?: Relation[]; with?: Relation[]; implements?: Relation[] } | undefined
): StateManager | undefined {
    if (!relations) {
        return undefined;
    }
    // What a class extends decides first; mixins and interfaces only when nothing else tells.
    for (const list of [relations.extends, relations.with, relations.implements]) {
        for (const rel of list ?? []) {
            const written = (typeof rel === 'string' ? rel : rel.name).split('<')[0].trim();
            const family = BASES[written.toLowerCase()];
            if (family) {
                return { family, base: written };
            }
        }
    }
    return undefined;
}
