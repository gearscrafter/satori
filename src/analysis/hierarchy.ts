/**
 * Which members override which, from what each class says it extends, implements or mixes in.
 *
 * Dart's "find references" on an interface method also lists the uses of the methods that implement it, because a
 * call through the interface reaches whichever implementation is there. The navigation of a file only says which
 * exact method an identifier points to, so this index lets those uses be added back.
 */
export interface HierarchySymbol {
    name: string;
    kind: number;
    children?: HierarchySymbol[];
    relations?: {
        extends?: (string | { name: string })[];
        implements?: (string | { name: string })[];
        with?: (string | { name: string })[];
    };
}

function parentNames(symbol: HierarchySymbol): string[] {
    const relations = symbol.relations;
    if (!relations) { return []; }
    return [...(relations.extends ?? []), ...(relations.implements ?? []), ...(relations.with ?? [])]
        .map(r => (typeof r === 'string' ? r : r.name).split('<')[0].trim())
        .filter(n => n !== '');
}

export class OverrideIndex<S extends HierarchySymbol> {
    private readonly ownerOfMember = new Map<S, S>();
    private readonly subclassesOf = new Map<string, S[]>();

    constructor(classes: S[]) {
        for (const cls of classes) {
            for (const child of (cls.children ?? []) as S[]) { this.ownerOfMember.set(child, cls); }
            for (const parent of parentNames(cls)) {
                const list = this.subclassesOf.get(parent);
                if (list) { list.push(cls); } else { this.subclassesOf.set(parent, [cls]); }
            }
        }
    }

    /** Members with the same name and kind in every class that comes, directly or not, from the member's class. */
    overridersOf(member: S): S[] {
        const owner = this.ownerOfMember.get(member);
        if (!owner) { return []; }
        const found: S[] = [];
        const seen = new Set<S>([owner]);
        const queue: S[] = [owner];
        while (queue.length) {
            const current = queue.shift()!;
            for (const sub of this.subclassesOf.get(current.name) ?? []) {
                if (seen.has(sub)) { continue; }
                seen.add(sub);
                queue.push(sub);
                for (const child of (sub.children ?? []) as S[]) {
                    if (child.name === member.name && child.kind === member.kind) { found.push(child); }
                }
            }
        }
        return found;
    }
}
