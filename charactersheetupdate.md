# Character Sheet Improvement Workplan

The work should be completed in six phases. The modal foundation and responsive structure should come first, because most later improvements depend on them.

## Current implementation status — 2026-09-20

**Workstream checkpoint:** Paused after completing the Inventory optimization. The current implementation is locally built and validated. Resume with final modal polish, followed by the Phase 5 responsive and accessibility matrix.

- **Phase 0:** Functional validation complete. Responsive baseline screenshots and recorded keyboard/screen-reader observations remain.
- **Phase 1:** Shared dialog foundation and primary migrations complete. Inventory Wallet, Forage, animal selection, drop confirmation, equipment notes, Conditions, Experience, and Skill Advancement now use the shared dialog stack. Remaining custom overlays must be reviewed before final acceptance.
- **Phase 2:** Embedded shared character-sheet dialog and responsive 1–2–3 column layout complete. The embedded sheet now has one document scroll owner. Final typography, touch-target, short-landscape, and overflow QA remain.
- **Phase 3:** Sticky mobile summary, mobile action bar, explicit attribute roll/edit behavior, Advancement naming, notification placement, conditional Spells action, Journal action, and keyboard-aware More menu complete.
- **Phase 4:** Skills preserves dialog/search/scroll context while rolling. Spellcasting now has searchable sticky controls, an internal detail view, visible WP affordability, and restored list position/focus. Inventory now uses compact expandable rows, collapsed item descriptions, inline actions, internal Wallet/Forage panels, and context-preserving navigation without floating controls. Notes has protected drafts and fixed editor actions. Advancement warns before abandoning in-progress work. Death-roll manual adjustments are expandable. Remaining work is final polish for Rest, Advancement, Injuries, and any remaining custom overlays.
- **Phase 5:** Shared-dialog, Skills, Spellcasting, and Inventory regression tests exist and pass. At this checkpoint, type checking, linting, the production build, and the full automated suite pass (40 test files, 226 tests). The full responsive/manual matrix and remaining workflow tests are still required.

### Resume point

1. Complete the Rest and Advancement consequence/confirmation presentation.
2. Finish the Injuries and Death Rolls interaction polish.
3. Audit the character sheet for remaining custom overlays outside the shared dialog system.
4. Run and document the Phase 5 viewport, keyboard, screen-reader, zoom, and high-content QA matrix.

This file is the source of truth for character-sheet improvements. Older general improvement documents are intentionally excluded from this workstream.

## Phase 0 — Restore development validation

**Goal:** Make the character sheet render locally so every UI change can be visually tested.

Tasks:

- Resolve missing `workbox-window`, `unist-util-visit`, and `micromark` dependencies.
- Confirm the character sheet opens from:
  - Direct character page
  - Party member list
  - Party encounter
  - Solo dashboard
- Capture baseline screenshots at:
  - 375×812 phone
  - 844×390 phone landscape
  - 768×1024 tablet
  - 1280×800 desktop
  - 1440×900 desktop
- Record existing keyboard and screen-reader behavior.

**Acceptance criteria:**

- Development build loads without import errors.
- All character-sheet entry points work.
- Baseline responsive screenshots exist.

**Estimate:** 0.5–1 day.

---

## Phase 1 — Shared modal foundation

**Goal:** Replace inconsistent modal behavior with one reusable and accessible dialog system.

Create a shared dialog component supporting:

- Dialog title and description associations
- Focus trapping and initial focus
- Focus restoration after closing
- Escape-to-close
- Backdrop closing when appropriate
- Body scroll locking
- Mobile safe-area padding
- `100dvh` full-screen mobile presentation
- Scrollable body with fixed header and footer
- Standardized z-index levels
- Nested confirmation-dialog support
- Optional unsaved-change protection

Migrate first:

1. Skills
2. Rest
3. Attribute editor
4. Stat modification
5. Player Aid
6. Dice Roller

Then migrate:

- Bio
- Inventory and its subdialogs
- Spellcasting
- Advancement
- Notes
- Injuries

Primary files:

- `src/components/character/CharacterSheet.tsx`
- `src/components/character/modals/SkillsModal.tsx`
- `src/components/character/InventoryModal.tsx`
- `src/components/dice/DiceRollerModal.tsx`

**Acceptance criteria:**

- Tab focus cannot escape an open dialog.
- Escape closes the topmost dismissible dialog.
- Focus returns to the control that opened it.
- Mobile keyboards do not hide primary actions.
- No modal uses an arbitrary independent z-index.

**Estimate:** 2–3 days.

---

## Phase 2 — Character-sheet structure and responsiveness

**Goal:** Prioritize frequently used play controls and reduce scrolling.

Tasks:

- Add an embedded presentation mode for the character sheet.
- Create one shared `CharacterSheetDialog` for party, encounter and solo usage.
- Remove duplicate modal wrappers from:
  - `src/components/party/PartyMemberList.tsx`
  - `src/components/party/PartyEncounterView.tsx`
  - `src/components/party/SoloDashboard.tsx`
- Introduce responsive layouts:
  - Phone: one column
  - Tablet: two columns
  - Desktop: three columns
- Replace the current short-landscape CSS with a readable compact layout.
- Remove the lower panel’s fixed 500px minimum height.
- Replace the remote parchment texture with a local asset or CSS treatment.
- Ensure all functional text is at least 14px.
- Ensure touch targets are approximately 44×44px or larger.

**Acceptance criteria:**

- No nested document-style scrolling when the sheet opens inside a modal.
- Tablet layout uses available horizontal space.
- Landscape mode remains readable without extremely small labels.
- No unexpected horizontal page overflow.

**Estimate:** 2–3 days.

---

## Phase 3 — Information architecture and primary actions

**Goal:** Make the most common actions available without searching or excessive scrolling.

Proposed hierarchy:

**Always visible**

- Character name
- HP and WP
- Active conditions
- Equipped weapon or primary combat information
- Core roll action

**Primary actions**

- Roll
- Skills
- Inventory
- Spells, when applicable
- Rest
- More

**Secondary “More” actions**

- Bio
- Journal
- Player Aid
- PDF
- Permanent attribute editing
- Advancement

Tasks:

- Add a compact sticky mobile summary header.
- Add a mobile bottom action bar.
- Reduce the number of equally weighted header buttons.
- Rename “Session” to “Advancement” or “End Session / Advance.”
- Make attribute rolling visibly actionable on touchscreens.
- Move permanent attribute editing behind an explicit edit mode or contextual menu.
- Add visible overflow indicators wherever tabs remain horizontally scrollable.
- Unify save and status notifications.

**Acceptance criteria:**

- Skills, rolling, HP/WP and inventory are reachable with one tap.
- Bio, PDF and advancement no longer compete with active-play actions.
- No essential action depends on hover.
- Notification messages do not cover modal headers or controls.

**Estimate:** 2 days.

---

## Phase 4 — Modal-specific improvements

### Skills

- Show search on phones.
- Replace focusable container elements with semantic controls.
- Keep filters/search sticky.
- Preserve scroll position after a dice roll.
- Improve skill information display for touch interaction.

### Inventory

- Convert Wallet and Forage into internal panels or drawers.
- Keep confirmation dialogs only for destructive actions.
- Simplify dense item rows.
- Prevent floating actions from covering content.
- Preserve selected inventory/shop tab after closing a detail view.

### Spellcasting

- Open spell details as an internal mobile view instead of another viewport overlay.
- Keep filters and search sticky.
- Show WP cost and current WP near the casting action.
- Preserve list position when returning from spell details.

### Notes

- Separate draft content from saved content.
- Make Cancel genuinely discard unsaved changes.
- Warn before closing an edited note.
- Keep editor actions visible above the virtual keyboard.

### Rest and advancement

- Show exact mechanical and time consequences before confirmation.
- Make step headers and footers consistent.
- Preserve advancement progress if the modal is accidentally closed.
- Clarify “Round Rest” duration and consequences.

### Injuries and death rolls

- Emphasize the next required action.
- Move history and manual controls behind expandable sections.
- Avoid opening more than one nested workflow layer.

**Acceptance criteria:**

- Every modal has a clear primary action.
- Closing or navigating backward does not unexpectedly lose work.
- Long collections remain searchable and retain context.
- Nested overlays are reduced to confirmations that genuinely require them.

**Estimate:** 3–4 days.

---

## Phase 5 — Testing and accessibility pass

Automated tests:

- Modal focus and Escape behavior
- Focus restoration
- Skills search at mobile widths
- Attribute roll versus edit behavior
- Notes draft cancellation
- Inventory nested workflow behavior
- Responsive sheet rendering
- Embedded character-sheet mode
- Notification positioning

Manual testing matrix:

| Viewport | Direct sheet | Party modal | Encounter modal | Solo modal |
|---|---:|---:|---:|---:|
| Phone portrait | ✓ | ✓ | ✓ | ✓ |
| Phone landscape | ✓ | ✓ | ✓ | ✓ |
| Tablet portrait | ✓ | ✓ | ✓ | ✓ |
| Tablet landscape | ✓ | ✓ | ✓ | ✓ |
| Desktop | ✓ | ✓ | ✓ | ✓ |

Also verify:

- Keyboard-only operation
- Screen-reader dialog announcements
- 200% browser zoom
- Long character names
- Characters with and without spells
- Empty and heavily populated inventory
- Maximum conditions and injuries
- Mobile virtual keyboard behavior

**Acceptance criteria:**

- No critical keyboard or focus failures.
- No clipped primary actions.
- No horizontal document overflow.
- Existing character mechanics and stored data remain unchanged.
- Responsive screenshots are approved against the baseline.

**Estimate:** 1.5–2 days.

---

## Recommended delivery order

1. Development environment repair
2. Shared dialog component
3. Skills modal migration
4. Shared embedded character-sheet wrapper
5. Responsive sheet restructuring
6. Primary action hierarchy
7. Inventory and spellcasting workflows
8. Notes, rest, advancement and injuries
9. Accessibility and regression testing

Estimated total: **11–15 engineer-days**, depending on how much automated coverage already exists.

The first releasable milestone should include the shared modal foundation, mobile Skills search, embedded sheet mode, improved tablet layout, and corrected primary action hierarchy. These changes deliver the largest usability improvement while limiting changes to game mechanics.
