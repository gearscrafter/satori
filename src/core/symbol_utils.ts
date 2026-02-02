import { KIND_CLASS, KIND_CONSTRUCTOR, KIND_ENUM, KIND_EXTENSION, KIND_FIELD, KIND_FUNCTION, KIND_METHOD, KIND_PROPERTY, KIND_TYPEDEF } from "./constants";

export function generateGlobalSymbolId(
  symbol: { name: string; kind: number; fileUri?: string },
  parentName?: string
): string {
  const fileUri = symbol.fileUri || 'unknown_uri';
  let symbolNamePart = symbol.name;
  const kindPrefix = getKindPrefix(symbol.kind);

  if (symbol.kind === KIND_CONSTRUCTOR && symbolNamePart === parentName) {
    symbolNamePart = '_default_';
  }

  return parentName
    ? `${fileUri}#parent:${parentName}#kind:${kindPrefix}#name:${symbolNamePart}`
    : `${fileUri}#kind:${kindPrefix}#name:${symbolNamePart}`;
}

export function getKindPrefix(kind: number): string {
    const map: Record<number, string> = { 5: 'class', 6: 'method', 12: 'func', 9: 'ctor', 8: 'field', 7: 'prop', 10: 'enum', 3: 'ext', 22: 'typedef' };
    return map[kind] || `k${kind}`;
}

export function SymbolKindToString(kind: number): string {
    const map: Record<number, string> = {
        [KIND_CLASS]: 'class',
        [KIND_METHOD]: 'method',
        [KIND_FUNCTION]: 'function',
        [KIND_CONSTRUCTOR]: 'constructor',
        [KIND_FIELD]: 'field',
        [KIND_PROPERTY]: 'property',
        [KIND_ENUM]: 'enum',
        [KIND_TYPEDEF]: 'typedef',
        [KIND_EXTENSION]: 'namespace', 
    };
    return map[kind] || `kind_${kind}`;
}