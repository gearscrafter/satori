import { ExternalPackageInfo, FileSource, ProjectGraphModel, ProjectGraphNode } from "../../types/index";
import * as vscode from 'vscode';
import { log } from "../../utils/logger";
import { isSamePath } from "../../filesystem/path_utils";

/**
 * Packages that deserve a container node. The project's own root package is left out: it is the
 * project itself, none of its classes are placed inside a container, and it would show up as an
 * empty "external package". Local packages of a monorepo are kept.
 */
export function packagesNeedingContainers(
  packages: ExternalPackageInfo[],
  projectRootPath: string | null | undefined
): ExternalPackageInfo[] {
  if (!projectRootPath) { return packages; }
  return packages.filter(pkg => !isSamePath(pkg.path, projectRootPath));
}

/**
 * Creates special nodes to represent external packages as containers
 * @param externalPackages Array of external packages
 * @param projectGraph Project graph model
 * @param generatedNodeIds Set of already generated node IDs
 * @param outputChannel Output channel for logs
 */
export function createPackageContainerNodes(
  externalPackages: ExternalPackageInfo[],
  projectGraph: ProjectGraphModel,
  generatedNodeIds: Set<string>
): void {
  log.debug(`[PackageContainers] Creating container nodes for${externalPackages.length} paquetes...`);

  for (const pkg of externalPackages) {
    const containerNodeId = `package_container:${pkg.name}`;
    
    if (!generatedNodeIds.has(containerNodeId)) {
      generatedNodeIds.add(containerNodeId);

      const fakeRange: vscode.Range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, pkg.name.length)
      );

      const containerNode: ProjectGraphNode = {
        id: containerNodeId,
        label: pkg.name,
        kind: 'package_container',
        data: {

          fileUri: `file:///packages/${pkg.name}`, 
          range: fakeRange,
          selectionRange: fakeRange,
          access: 'public',
          isSDK: pkg.type === 'sdk',
          layer: 'utility',
          
          source: {
            type: 'external_package',
            packageName: pkg.name,
            packageVersion: pkg.version,
            packageType: pkg.type
          } as FileSource,
          
          packageName: pkg.name,
          packageVersion: pkg.version,
          packageType: pkg.type
        },
        
        parent: undefined,
        
        inDegree: 0,
        outDegree: 0
      };

      projectGraph.nodes.push(containerNode);
      log.debug(` ✅ Container created: ${pkg.name} (${pkg.type})`);
    }
  }

  log.debug(`[PackageContainers] ✅ ${projectGraph.nodes.filter(n => n.kind === 'package_container').length} package containers created`);
}
