import { ProjectGraphModel, ExternalPackageInfo, ProjectGraphEdge } from "../../types/index";
import { log } from "../../utils/logger";

/**
 * Creates edges between nodes from different packages to show dependencies
 * @param projectGraph Project graph model
 * @param externalPackages Array of external packages
 * @param createEdge Function to create edges
 * @param outputChannel Output channel for logs
 */

export function createInterPackageDependencyEdges(
  projectGraph: ProjectGraphModel,
  externalPackages: ExternalPackageInfo[],
  createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void
): void {
  log.debug(`[InterPackageDeps] Analyzing dependencies between packages...`);

  const packageContainerMap = new Map<string, string>();
  
  for (const pkg of externalPackages) {
    packageContainerMap.set(pkg.name, `package_container:${pkg.name}`);
  }

  let interPackageEdges = 0;

  for (const edge of projectGraph.edges) {
    const sourceNode = projectGraph.nodes.find(n => n.id === edge.source);
    const targetNode = projectGraph.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) continue;

    const sourcePackage = sourceNode.data.source?.packageName;
    const targetPackage = targetNode.data.source?.packageName;
    
    if (sourcePackage && targetPackage && sourcePackage !== targetPackage) {
      const sourceContainerId = packageContainerMap.get(sourcePackage);
      const targetContainerId = packageContainerMap.get(targetPackage);
      
      if (sourceContainerId && targetContainerId) {
        createEdge(sourceContainerId, targetContainerId, 'USES_AS_TYPE');
        interPackageEdges++;
        
        log.debug(`   Dependency: ${sourcePackage} → ${targetPackage}`);
      }
    }
    
    if (!sourcePackage && targetPackage) {
      const targetContainerId = packageContainerMap.get(targetPackage);
      if (targetContainerId) {
        const projectContainerId = 'project_root';
        createEdge(projectContainerId, targetContainerId, 'USES_AS_TYPE');
      }
    }
  }

  log.debug(`  ✅ ${interPackageEdges} inter-package dependencies created`);
}
