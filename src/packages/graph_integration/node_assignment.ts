import { ExternalPackageInfo, ProjectGraphModel } from "../../types/index";
import { log } from "../../utils/logger";
import { determineFileSource } from "../source_detector";

/**
 * Assigns nodes to their respective package containers
 * @param projectGraph Project graph model
 * @param externalPackages Array of external packages
 * @param outputChannel Output channel for logs
 */
export function assignNodesToPackageContainers(
  projectGraph: ProjectGraphModel,
  externalPackages: ExternalPackageInfo[]
): void {
  log.debug(`[PackageAssignment] Assigning nodes to package containers...`);
  
  let assignedCount = 0;
  let projectNodesCount = 0;

  for (const node of projectGraph.nodes) {
    if (node.kind === 'package_container') {continue;}

    const fileSource = determineFileSource(node.data.fileUri, externalPackages);
    
    node.data.source = fileSource;

    if (fileSource.type === 'external_package' && fileSource.packageName) {
      const containerNodeId = `package_container:${fileSource.packageName}`;
      node.parent = containerNodeId;
      assignedCount++;
      
      node.label = `🔗 ${node.label}`;
      
      log.debug(`    📦 ${node.label} → ${fileSource.packageName}`);
      
    } else if (fileSource.type === 'sdk') {
      node.label = `⚙️ ${node.label}`;
      
    } else if (fileSource.type === 'project') {
      projectNodesCount++;
    }
  }

  log.debug(`  ✅ Assignment completed:`);
  log.debug(`    • Project nodes: ${projectNodesCount}`);
  log.debug(`    • External package nodes: ${assignedCount}`);
}
