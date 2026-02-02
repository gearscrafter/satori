import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export interface ProjectGraphNode {
  id: string; // Global unique ID for this node (e.g. "fileUri#Class#Method")
  label: string; // What will be shown in the node (e.g. "MyClass", "myMethod")
  kind: string; // A descriptive string (e.g. "class", "method", "function", "enum", "file")
  data: { // Additional data from the original EnrichedSymbol
    fileUri: string;
    range?: vscode.Range;
    selectionRange?: vscode.Range | undefined; // For navigation
    access?: 'public' | 'private' | 'protected';
    isSDK?: boolean;
    returnType?: string; // For functions/methods
    resolvedType?: string; // For fields/variables
    layer?: 'view' | 'state' | 'service' | 'model' | 'utility' | 'member';
    // Adding missing properties
    source?: FileSource; // Information about file origin
    packageName?: string; // Package name (for compatibility)
    packageVersion?: string; // Package version (for compatibility)
    packageType?: PackageType; // Package type (for compatibility)
  };
  parent?: string; // Parent node ID (for nested/compound graphs, e.g. class ID for a method)
  inDegree?: number;  // Number of edges pointing TO this node.
  outDegree?: number; // Number of edges going FROM this node.
}

export interface ProjectGraphEdge {
  id: string; // Unique ID for the edge (e.g. "sourceNodeId->targetNodeId#type")
  source: string; // Source node ID
  target: string; // Target node ID
  label?: 'CALLS' | 
          'EXTENDS' | 
          'IMPLEMENTS' | 
          'INSTANCE_OF' |
          'USES_AS_TYPE' |
          'READS_FROM' |        // A method READS the value of a field/variable.
          'WRITES_TO' |         // A method WRITES/assigns a value to a field/variable.
          'PASSES_AS_ARGUMENT'; // A method PASSES a field/variable as argument to another function.

  // Adding typeRef here so the object is complete
  typeRef?: TypeReference;
};


export interface ProjectGraphModel {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
}

export interface TypeReference {
  name: string; 
  definition?: DefinitionInfo;
}

export type ParsedParameter = {
  type: string;
  name?: string;
  isNamed?: boolean;
  isRequired?: boolean;
  isOptionalPositional?: boolean;
  // Añadimos typeRef aquí para que el objeto sea completo
  typeRef?: TypeReference;
};

export type DefinitionInfo = {
  name: string;
  fileUri: string;
  range?: vscode.Range;
  selectionRange: vscode.Range;
  kind: number; 
  isSDK: boolean;
};

export interface MinimalSymbolDataForId {
    name: string;
    kind: number;
    fileUri?: string; 
    }

export interface EnrichedSymbol {
  name: string;
  kind: number;
  detail?: string;
  range?: vscode.Range;
  selectionRange?: vscode.Range; 
  children?: EnrichedSymbol[];
  parentId?: string;
  access?: 'public' | 'private' | 'protected';
  relations?: { 
    extends?: (string | TypeReference)[]; 
    implements?: (string | TypeReference)[];
    with?: (string | TypeReference)[];
    fileUri?: string; 
  };
  fileUri?: string;
  isSDK?: boolean;
  hoverChecked?: boolean;

  // Properties added during enrichment
  resolvedType?: string;   // For fields/variables
  resolvedTypeRef?: TypeReference; 

  returnType?: string;
  returnTypeRef?: TypeReference;

  parameters?: {  
    name?: string | undefined; 
    type: string;
    typeRef?: TypeReference;
    isNamed?: boolean;
    isRequired?: boolean; // Only relevant if isNamed is true
    isOptionalPositional?: boolean; 
    isSDKTarget?: boolean; 
  }[]; // For methods/functions

  outgoingCalls?: {
    targetName: string;       // Name of the called symbol
    targetDetail?: string;    // Detail of the called symbol (may include signature)
    targetUri: string;        // URI of the file where the called symbol is defined
    targetKind: number;       // Kind of the called symbol
    targetRange?: vscode.Range;
    targetSelectionRange?: vscode.Range; // Selection range of the called symbol
    targetParentClassName?: string | null;
    // fromRanges?: vscode.Range[]; // Optional: ranges in current symbol from where the call is made
  }[];
  incomingCalls?: {
    sourceName: string;
    sourceDetail?: string; // Detail of the calling symbol (may have signature)
    sourceUri: string;
    sourceKind: number;
    sourceRange?: vscode.Range; 
    sourceSelectionRange: vscode.Range; // Range of the name of the calling symbol
    sourceParentClassName?: string | null; // Container class of the calling symbol, if applicable
    fromRanges: vscode.Range[]; // Ranges in the caller's file where the call to the current symbol is made
    isSDKSource?: boolean; // If the calling symbol is from the SDK
  }[]; // If you decide to implement incoming calls
  references?: vscode.Location[];
  uniqueId?: string;         // A canonical ID for this symbol
  definitionUri?: string;    // URI of the file where this symbol is defined (may be redundant with fileUri)
  definitionRange?: vscode.Range; // Definition range
}

export interface EnrichmentDependencies {
    client?: LanguageClient;
    projectClassRelations: Map<string, { extends?: string[]; with: string[], implements?: string[] }>; 
    fileContent: string; 
    allProjectFilesData: Array<{ file: string; fileUri: string; symbols: EnrichedSymbol[] }>;
}

export type PackageType = 'sdk' | 'flutter_official' | 'third_party' | 'ui_library' | 'state_management' | 'custom' |  'dev_tools';

export interface ExternalPackageInfo {
  name: string;
  path: string;
  version: string;
  type: PackageType;
  dartFiles: string[];
  hasLibFolder: boolean;
  isFlutterPackage: boolean;
  description: string;
}

export interface FileSource {
  type: 'project' | 'external_package' | 'sdk' | 'custom';
  packageName?: string;
  packageVersion?: string;
  packageType?: PackageType;
  relativePath?: string;
}


export interface LSPHoverResponse {
    contents: string | { language: string; value: string } | Array<string | { language: string; value: string }>;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}