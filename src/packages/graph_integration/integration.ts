import { ProjectGraphModel, ProjectGraphEdge } from "../../types/index";
import { findAllPackages } from "../package_discovery";
import { createPackageContainerNodes } from "./container_nodes";
import { createInterPackageDependencyEdges } from "./dependency_edges";
import { assignNodesToPackageContainers } from "./node_assignment";
import { log } from "../../utils/logger";

/**
 * Main function to integrate complete external package handling
 * into the project graph model. Coordinates package discovery,
 * container node creation, node assignment, and generation of
 * inter-package dependency edges.
 * 
 * @param projectGraph - Project graph model to enrich
 * @param projectRoot - Project root path
 * @param generatedNodeIds - Set of already generated node IDs
 * @param createEdge - Function to create new edges in the graph
 */
export async function integrateExternalPackages(
  projectGraph: ProjectGraphModel,
  projectRoot: string,
  generatedNodeIds: Set<string>,
  createEdge: (sourceId: string, targetId: string, label: ProjectGraphEdge['label']) => void,
): Promise<void> {
  log.debug(`[ExternalPackages] 🔍 Integrating external packages..`);

  const externalPackages = findAllPackages(projectRoot);
  
  if (externalPackages.length === 0) {
    log.debug(`[ExternalPackages] No relevant external packages found`);
    return;
  }

  createPackageContainerNodes(externalPackages, projectGraph, generatedNodeIds);

  assignNodesToPackageContainers(projectGraph, externalPackages);

  createInterPackageDependencyEdges(projectGraph, externalPackages, createEdge);

  log.debug(`[ExternalPackages] ✅ External package integration completed`);
}
