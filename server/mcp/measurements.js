import { Buffer } from 'node:buffer';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDragonbaneMcpServer } from './server.js';

export const MCP_SIZE_BUDGETS = Object.freeze({
  // Cursor fields add a small schema cost while preventing unbounded recurring reads.
  fullCatalogRegressionBytes: 110_000,
  coreCatalogBytes: 40_000,
  outputSchemasBytes: 12_000,
  instructionsBytes: 1_500,
  compactResumeBytes: 12_000,
  focusedResumeBytes: 25_000,
  ordinaryWriteBytes: 5_000,
});

export const MCP_CORE_TOOL_NAMES = Object.freeze([
  'list_campaigns',
  'get_campaign_state',
  'get_resume_state',
  'get_actor',
  'get_recent_events',
  'get_session_history',
  'start_session',
  'checkpoint_session',
  'complete_session',
  'append_campaign_event',
  'apply_actor_changes',
]);

export function serializedJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export async function measureMcpCatalog() {
  const server = createDragonbaneMcpServer({});
  const client = new Client({ name: 'dragonbane-mcp-measurement', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const catalog = await client.listTools();
    const instructions = client.getInstructions() || '';
    const toolSizes = catalog.tools
      .map((tool) => ({ name: tool.name, bytes: serializedJsonBytes(tool) }))
      .sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name));
    const coreTools = catalog.tools.filter((tool) => MCP_CORE_TOOL_NAMES.includes(tool.name));

    return {
      toolCount: catalog.tools.length,
      catalogBytes: serializedJsonBytes(catalog),
      instructionsBytes: Buffer.byteLength(instructions, 'utf8'),
      coreCatalogBytes: serializedJsonBytes({ tools: coreTools }),
      largestTools: toolSizes.slice(0, 10),
      surfaceBytes: {
        inputSchemas: catalog.tools.reduce((total, tool) => total + serializedJsonBytes(tool.inputSchema), 0),
        outputSchemas: catalog.tools.reduce((total, tool) => total + serializedJsonBytes(tool.outputSchema), 0),
        descriptions: Buffer.byteLength(catalog.tools.map((tool) => tool.description || '').join(''), 'utf8'),
      },
    };
  } finally {
    await client.close();
    await server.close();
  }
}
