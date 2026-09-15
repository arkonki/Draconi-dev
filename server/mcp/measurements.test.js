// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MCP_CORE_TOOL_NAMES, MCP_SIZE_BUDGETS, measureMcpCatalog } from './measurements.js';
import { measureRepresentativeResponses } from './responseSizeFixtures.js';

describe('MCP token-size budgets', () => {
  it('measures the complete catalog and prevents baseline growth', async () => {
    const report = await measureMcpCatalog();

    expect(report.toolCount).toBe(61);
    expect(report.catalogBytes).toBeLessThanOrEqual(MCP_SIZE_BUDGETS.fullCatalogRegressionBytes);
    expect(report.largestTools).toHaveLength(10);
    expect(report.surfaceBytes.inputSchemas).toBeGreaterThan(0);
    expect(report.surfaceBytes.outputSchemas).toBeLessThanOrEqual(MCP_SIZE_BUDGETS.outputSchemasBytes);
  });

  it('keeps the proposed core catalog and initialization instructions within budget', async () => {
    const report = await measureMcpCatalog();

    expect(MCP_CORE_TOOL_NAMES).toHaveLength(11);
    expect(report.coreCatalogBytes).toBeLessThanOrEqual(MCP_SIZE_BUDGETS.coreCatalogBytes);
    expect(report.instructionsBytes).toBeLessThanOrEqual(MCP_SIZE_BUDGETS.instructionsBytes);
  });

  it('measures deterministic representative read, write, and resume responses', () => {
    const first = measureRepresentativeResponses();
    const second = measureRepresentativeResponses();

    expect(second).toEqual(first);
    expect(Object.keys(first.resume)).toEqual([
      'compactCampaign', 'multiCharacterCampaign', 'equipmentHeavyCharacter',
      'activeCombatCampaign', 'activeSoloMission', 'historyHeavyCampaign',
    ]);
    expect(Object.values(first.reads).every((bytes) => bytes > 0)).toBe(true);
    expect(Object.values(first.writes).every((bytes) => (
      bytes > 0 && bytes <= MCP_SIZE_BUDGETS.ordinaryWriteBytes
    ))).toBe(true);
    expect(Object.values(first.resumeProfiles).every(({ compact, focused, full }) => (
      compact <= MCP_SIZE_BUDGETS.compactResumeBytes
      && focused <= MCP_SIZE_BUDGETS.focusedResumeBytes
      && compact < focused
      && focused < full
    ))).toBe(true);
  });
});
