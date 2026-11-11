# Unused and Legacy Code Audit

Audit date: 2026-09-27

> **Status (2026-10-07):** the confirmed-unreachable files, the legacy Supabase Edge Functions and the
> tracked build output have been removed, and `npm run typecheck` is clean and enforced by `npm run build`.
> Still open: stale public assets, unused exports and types, the root `bcryptjs` dependency, and the
> historical planning files that remain outside `docs/archive/`.


This list separates files that are unreachable from the current application entry points from cleanup candidates that should receive a final deployment or product-policy check before removal.

## Summary

- [ ] 73 unreachable files detected by static import analysis
- [ ] 63 of those files are under `src/`
- [ ] 8 are legacy Supabase Edge Functions
- [ ] 2 are generated or obsolete public files
- [ ] Approximately 6,996 lines / 893 KB of unreachable source
- [ ] 55 unused exported functions, constants, or components
- [ ] 46 unused exported TypeScript types
- [ ] 3 duplicate export declarations
- [ ] 1 unresolved import in active code

Unused frontend source normally does not enter the Vite production bundle. Removing it primarily improves maintainability and makes the real TypeScript error count easier to address.

## Confirmed Unreachable Files

### Generated and public files

- [ ] `dev-dist/registerSW.js`
- [ ] `public/cors.ts`

### Duplicate and obsolete shared components

- [ ] `src/components/ErrorBoundary.tsx` — replaced by `src/components/errors/ErrorBoundary.tsx`
- [ ] `src/components/errors/ErrorFallback.tsx`
- [ ] `src/components/shared/BreadcrumbsExamples.tsx`
- [ ] `src/components/shared/Card.tsx`
- [ ] `src/components/shared/cors.ts`
- [ ] `src/components/shared/phb.standalone.css`
- [ ] `src/components/shared/useBreadcrumbs.ts`

### Old admin components

- [ ] `src/components/admin/CompendiumAdmin.tsx`
- [ ] `src/components/admin/DataTable.tsx`
- [ ] `src/components/admin/EditModal.tsx`
- [ ] `src/components/admin/EmailMonitoring.tsx`
- [ ] `src/components/admin/SmtpSettings.tsx`

### Unused specialized item forms

The current game-data manager uses the general item form instead of these category-specific wrappers.

- [ ] `src/components/admin/Forms/AnimalsForm.tsx`
- [ ] `src/components/admin/Forms/ArmorHelmetsForm.tsx`
- [ ] `src/components/admin/Forms/ClothesForm.tsx`
- [ ] `src/components/admin/Forms/ContainersForm.tsx`
- [ ] `src/components/admin/Forms/HuntingFishingForm.tsx`
- [ ] `src/components/admin/Forms/LightSourcesForm.tsx`
- [ ] `src/components/admin/Forms/MeansOfTravelForm.tsx`
- [ ] `src/components/admin/Forms/MedicineForm.tsx`
- [ ] `src/components/admin/Forms/MeleeWeaponsForm.tsx`
- [ ] `src/components/admin/Forms/MusicalInstrumentsForm.tsx`
- [ ] `src/components/admin/Forms/RangedWeaponsForm.tsx`
- [ ] `src/components/admin/Forms/ServicesForm.tsx`
- [ ] `src/components/admin/Forms/StudiesMagicForm.tsx`
- [ ] `src/components/admin/Forms/ToolsForm.tsx`
- [ ] `src/components/admin/Forms/TradeGoodsForm.tsx`

### Replaced character-sheet components

- [ ] `src/components/character/CharacterView.tsx`
- [ ] `src/components/character/ConditionsModal.tsx`
- [ ] `src/components/character/EquipmentModal.tsx`
- [ ] `src/components/character/ExperienceModal.tsx`
- [ ] `src/components/character/ExperienceSystem.tsx`
- [ ] `src/components/character/HeroicAbilitiesTable.tsx`
- [ ] `src/components/character/SpellsView.tsx`
- [ ] `src/components/character/modals/SkillAdvancementModal.tsx`
- [ ] `src/components/character/steps/OtherSkillsSelection.tsx`

### Compendium, party, and settings components

- [ ] `src/components/compendium/TemplateManager.tsx`
- [ ] `src/components/party/InvitePlayerDialog.tsx`
- [ ] `src/components/party/PartyHeader.tsx`
- [ ] `src/components/party/SessionEndCheatsheet.tsx`
- [ ] `src/components/settings/CompendiumSettings.tsx`

### Dormant theme implementation

- [ ] `src/contexts/ThemeContextStore.ts`
- [ ] `src/contexts/ThemeProvider.tsx`
- [ ] `src/contexts/useTheme.ts`

### Unused data, hooks, and API modules

- [ ] `src/data/index.ts`
- [ ] `src/hooks/useCharacterAbilities.ts`
- [ ] `src/hooks/useMagic.ts`
- [ ] `src/lib/api/bioData.ts`
- [ ] `src/lib/inventoryUtils.ts`

### Old authentication, email, CORS, and database helpers

- [ ] `src/lib/auth/connection.ts`
- [ ] `src/lib/auth/passwordChange.ts`
- [ ] `src/lib/auth/rateLimit.ts`
- [ ] `src/lib/cors.ts`
- [ ] `src/lib/database.types.ts`
- [ ] `src/lib/email/config.ts`
- [ ] `src/lib/email/logger.ts`
- [ ] `src/lib/email/rateLimiter.ts`
- [ ] `src/lib/email/smtp.ts`
- [ ] `src/lib/email/templates.ts`

### Old test helpers and pages

- [ ] `src/lib/tests/databaseTest.ts`
- [ ] `src/lib/tests/runTests.ts`
- [ ] `src/pages/Register.tsx` — no registration route exists in the current application
- [ ] `src/styles/homebrew.css`

### Legacy Supabase Edge Functions

These are not used by the self-hosted Node/PostgreSQL runtime. Remove them if restoring deployment to Supabase Edge Functions is no longer a requirement.

- [ ] `supabase/functions/_shared/projector.ts`
- [ ] `supabase/functions/create-party-display-session/index.ts`
- [ ] `supabase/functions/get-player-display-state/index.ts`
- [ ] `supabase/functions/renew-party-display-session/index.ts`
- [ ] `supabase/functions/revoke-party-display-session/index.ts`
- [ ] `supabase/functions/send-chat-push/index.ts`
- [ ] `supabase/functions/send-encounter-push/index.ts`
- [ ] `supabase/functions/update-party-display-layout/index.ts`

## Likely Public-Asset Cleanup

These files are not referenced by the application or current PWA manifest. Confirm them with one local and deployed smoke test before deletion.

- [ ] `public/_redirects` — obsolete Netlify redirect file
- [ ] `public/assets/dragonbane-sheet.jpg`
- [ ] `public/assets/dragonbane-sheet-bg.jpg`
- [ ] `public/icons/icon-48x48.png`
- [ ] `public/icons/icon-256x256.png`
- [ ] `public/icons/maskable-icon-512x512` — extensionless duplicate/alternative
- [ ] `favicon_io/site.webmanifest` — replaced by the Vite PWA manifest
- [ ] Remove `cors.ts` and `_redirects` from `hosting/apache.htaccess.template`

Do not remove these currently used public assets:

- `public/dragonbane-icon.png`
- `public/sounds/dice-roll.mp3`
- `public/sounds/notification.mp3`
- PWA icons referenced by `vite.config.ts`

## Generated Files Tracked by Git

The repository currently tracks generated output even though `dist/` is ignored.

- [ ] Stop tracking the 15 committed files under `dist/`
- [ ] Stop tracking `dev-dist/registerSW.js`
- [ ] Remove the `git restore --worktree -- dist` workaround from `deploy.sh`
- [ ] Verify that deployment continues to build and publish `dist/` from source

## Unused Exports

Review these individually. Some server helpers may be deliberate public/test APIs even if the current repository does not import them.

### Server exports

- [ ] `server/campaignRoles.js`: `CAMPAIGN_ROLES`
- [ ] `server/helper/auth.js`: `authenticateHelperToken`
- [ ] `server/helper/identifiers.js`: `stableUuid`
- [ ] `server/helper/rules.js`: `addCondition`, `applyActorChange`, `restoreWillpower`
- [ ] `server/helper/schemas.js`: `actorChangeSchema`, `currentSceneSchema`
- [ ] `server/helper/soloRules.js`: `FORTUNE_CATEGORIES`, `FORTUNE_TILTS`, `INSPIRATION_COLUMNS`, `SIMPLE_NPC_TEMPLATES`, `SOLO_NPC_ROLES`
- [ ] `server/mcp/responseSizeFixtures.js`: `MCP_RESPONSE_SIZE_FIXTURES`
- [ ] `server/mcp/server.js`: `mcpToolAnnotations`
- [ ] `server/mcp/workflows.js`: `GM_WORKFLOW_VERSION`
- [ ] `server/projector.js`: `getPlayerDisplayState`

### Frontend exports

- [ ] `src/components/admin/Forms/MonsterForm.tsx`: default export
- [ ] `src/components/admin/hooks/useGameData.ts`: `useGameData`
- [ ] `src/components/character/InventoryModal.tsx`: `MoneyManagementPanel`
- [ ] `src/components/settings/AdminSettings.tsx`: default export
- [ ] `src/components/shared/DropdownMenu.tsx`: `DropdownMenuSeparator`
- [ ] `src/lib/api/compendium.ts`: `createCompendiumEntry`, `fetchCompendiumTemplates`
- [ ] `src/lib/api/encounters.ts`: `fetchLatestEncounterForParty`, `rollInitiativeForCombatants`
- [ ] `src/lib/api/magic.ts`: `fetchGeneralSpells`, `fetchSpellsBySchool`
- [ ] `src/lib/api/monsters.ts`: `fetchMonsterById`, `fetchMonstersByCategory`
- [ ] `src/lib/api/notifications.ts`: `transformStateToDB`
- [ ] `src/lib/api/parties.ts`: `addPartyMember`
- [ ] `src/lib/api/projectorDisplay.ts`: `clearStoredPartyDisplayToken`, `storePartyDisplayToken`
- [ ] `src/lib/appUrl.ts`: `getAppPath`
- [ ] `src/lib/auth/auth.ts`: `refreshSession`
- [ ] `src/lib/auth/validation.ts`: `formatLoginRequest`, `passwordSchema`
- [ ] `src/lib/encounterStatusEffects.ts`: `normalizeEncounterStatusEffects`
- [ ] `src/lib/equipment.ts`: `copperToCurrency`, `currencyToCopper`, `findEquipment`
- [ ] `src/lib/game/randomTableUtils.ts`: `lookupTableResult`, `rollD66`, `rollDie`
- [ ] `src/lib/gameDataImport.ts`: `ITEM_IMPORT_COLUMNS`, `SPELL_IMPORT_COLUMNS`
- [ ] `src/lib/initiativeSlots.ts`: `completedInitiativeSlotsFor`
- [ ] `src/lib/movement.ts`: `agilityModifiers`, `kinData`
- [ ] `src/lib/realtime/channelManager.ts`: `flushRealtimeAsyncWork`
- [ ] `src/lib/soloAbilities.ts`: `SOLO_ABILITY_RULE_KEYS`, `isSoloAbility`
- [ ] `src/lib/supabase.ts`: `checkBackendConnection` only; keep the module itself
- [ ] `src/lib/utils.ts`: `parseSkillLevels`

## Unused Exported Types

- [ ] `src/components/admin/Forms/ItemForm.tsx`: `ItemFormOnChange`
- [ ] `src/components/admin/hooks/useGameData.ts`: `DataCategory`
- [ ] `src/components/dice/DiceContext.tsx`: `DiceContextType`
- [ ] `src/components/shared/Button.tsx`: `ButtonProps`
- [ ] `src/lib/adminMaintenance.ts`: `HousekeepingResult`
- [ ] `src/lib/adminRecovery.ts`: `RecoveryManifest`
- [ ] `src/lib/api/campaignTime.ts`: `CampaignGameTime`, `CampaignSessionSummary`, `CampaignTimeNotification`, `CampaignTimeReminder`
- [ ] `src/lib/api/solo.ts`: `SoloActorCondition`, `SoloActorInventoryItem`, `SoloAdventureJournal`, `SoloCharacterOption`, `SoloDanger`, `SoloHeroicAbilityOption`, `SoloJournalSession`, `SoloMission`, `SoloMissionAdvancement`, `SoloNpc`, `SoloThreat`, `SoloTreasureDraw`
- [ ] `src/lib/api/trustedRolls.ts`: `TrustedRecordedRoll`, `TrustedRollOutcome`
- [ ] `src/lib/gameDataImport.ts`: `GameDataImportRow`
- [ ] `src/types/character.ts`: `Attributes`, `CharacterItemNotes`, `CharacterStub`, `Equipment`, `ItemNote`, `PartyStub`, `SkillLevels`, `Teacher`
- [ ] `src/types/compendium.ts`: `BioData`
- [ ] `src/types/magic.ts`: `AnySchoolPrerequisite`, `AttributeLevelPrerequisite`, `BasePrerequisite`, `LogicalPrerequisite`, `PrerequisiteType`, `SchoolMembershipPrerequisite`, `SinglePrerequisite`, `SkillLevelPrerequisite`, `SpellKnownPrerequisite`
- [ ] `src/types/projectorDisplay.ts`: `PlayerDisplayCharacter`
- [ ] `src/types/timeTracker.ts`: `HourState`, `TimeTrackerGrid`

## Duplicate Exports

- [ ] Review named/default export duplication in `src/components/admin/Forms/MonsterForm.tsx`
- [ ] Review named/default export duplication in `src/components/settings/AdminSettings.tsx`
- [ ] Review duplicate export declarations in `src/lib/auth/validation.ts`

## Active-Code Problems Discovered During the Audit

These are not unused-code removals, but they should be fixed before unused-code checks become a required build gate.

- [ ] Fix `src/components/admin/Forms/BioForm.tsx` importing the missing `src/types/gameData` module
- [ ] Replace the ineffective root `tsc --noEmit` command with explicit app and Vite configuration checks
- [ ] Add Node type definitions to the Vite configuration project
- [ ] Type the Vitest `test` configuration correctly
- [ ] Separate application and test TypeScript configurations
- [ ] Resolve the remaining active frontend TypeScript errors by feature group
- [ ] Make real type checking mandatory in `npm run build` after the existing errors are cleared

Audit counts from the real frontend TypeScript check:

- 803 total errors
- 234 errors in test files
- 126 errors in unreachable files
- 443 errors across 90 active application files
- 9 additional Vite configuration errors

## Dependency Review

- [ ] Remove root-level `bcryptjs` after confirming the server-local dependency remains installed
- [ ] Keep root-level `pg`; root smoke-test scripts use it
- [ ] Keep `workbox-window`; Vite PWA registration uses it indirectly
- [ ] Configure unused-code analysis as a multi-package/workspace check so `sharp`, `ws`, and `@modelcontextprotocol/sdk` are correctly attributed to `server/package.json`

## Historical and Planning Files

These do not affect the application bundle. Consider moving completed material to `docs/archive/` instead of deleting it immediately.

- [ ] `.bolt/`
- [ ] `.stackblitz/`
- [ ] `dark.md`
- [ ] `improvements.md`
- [ ] `worklist.md`
- [ ] `tasklist.md`
- [ ] `gameplan.md`
- [ ] `encounter.md`
- [ ] `notification.md`
- [ ] `charactersheet-live-fixes.md`
- [ ] Completed sections of `charactersheetupdate.md`
- [ ] Completed sections of `workplan.md`
- [ ] `scripts/merge-supabase-import.sql` — archive rather than delete while migration recovery may still be useful

## Recommended Execution Order

1. Remove confirmed unreachable frontend leaves and duplicate components.
2. Remove stale public files and stop tracking generated build output.
3. Run lint, the full test suite, a production build, and local UI smoke tests.
4. Archive or remove legacy Supabase Edge Functions and historical migration material.
5. Repair the TypeScript project configuration.
6. Resolve active TypeScript errors feature by feature.
7. Remove unused exports and dependencies.
8. Add unused-code and real type-check checks to the normal verification workflow.

## Files That Must Not Be Removed Based on Their Names Alone

- `src/lib/supabase.ts` is the active local-backend compatibility layer and has many imports.
- Supabase migration/export scripts in `scripts/` may still be useful for recovery or historical imports.
- `server/migrations/` is required for creating and upgrading PostgreSQL databases.
- Server smoke-test and measurement scripts are invoked through `package.json` scripts.
