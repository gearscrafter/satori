export function parseBaseTypeName(typeString?: string): string | undefined {
    if (!typeString) return undefined;
    let currentType = typeString.trim().replace(/\?$/, '');
    const genericMatch = currentType.match(/^[\w\s]+\s*<(.+)>$/);
    if (genericMatch?.[1]) {
         const innerType = parseBaseTypeName(genericMatch[1]);
         if (innerType) return innerType;
    }
    return currentType.split('.').pop()?.split(' ').pop() || currentType;
}

export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')                  
    .replace(/\/\*[\s\S]*?\*\//g, '')          
    .replace(/(["'`])(?:\\.|[^\\])*?\1/g, ''); 
}