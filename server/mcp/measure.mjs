import { MCP_SIZE_BUDGETS, measureMcpCatalog } from './measurements.js';
import { measureRepresentativeResponses } from './responseSizeFixtures.js';

const report = await measureMcpCatalog();
const responseBytes = measureRepresentativeResponses();
const resumeProfiles = Object.values(responseBytes.resumeProfiles);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), budgets: MCP_SIZE_BUDGETS, ...report, responseBytes }, null, 2));

const failures = [
  report.catalogBytes > MCP_SIZE_BUDGETS.fullCatalogRegressionBytes
    ? `Full catalog is ${report.catalogBytes} bytes; regression ceiling is ${MCP_SIZE_BUDGETS.fullCatalogRegressionBytes}.`
    : null,
  report.coreCatalogBytes > MCP_SIZE_BUDGETS.coreCatalogBytes
    ? `Core catalog is ${report.coreCatalogBytes} bytes; target is ${MCP_SIZE_BUDGETS.coreCatalogBytes}.`
    : null,
  report.instructionsBytes > MCP_SIZE_BUDGETS.instructionsBytes
    ? `Instructions are ${report.instructionsBytes} bytes; target is ${MCP_SIZE_BUDGETS.instructionsBytes}.`
    : null,
  resumeProfiles.some(({ compact }) => compact > MCP_SIZE_BUDGETS.compactResumeBytes)
    ? `At least one compact resume fixture exceeds ${MCP_SIZE_BUDGETS.compactResumeBytes} bytes.`
    : null,
  resumeProfiles.some(({ focused }) => focused > MCP_SIZE_BUDGETS.focusedResumeBytes)
    ? `At least one focused resume fixture exceeds ${MCP_SIZE_BUDGETS.focusedResumeBytes} bytes.`
    : null,
  Object.values(responseBytes.writes).some((bytes) => bytes > MCP_SIZE_BUDGETS.ordinaryWriteBytes)
    ? `At least one ordinary write fixture exceeds ${MCP_SIZE_BUDGETS.ordinaryWriteBytes} bytes.`
    : null,
].filter(Boolean);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
