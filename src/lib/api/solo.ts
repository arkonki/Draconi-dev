import { authenticatedApiFetch } from '../supabase';

export interface SoloCampaignStatus {
  enabled: boolean;
  rulesetVersion?: string | null;
  mode?: 'custom' | 'deepfall_breach' | null;
  playerCharacterId: string | null;
  soloHeroicAbilityId?: string | null;
  soloHeroicAbilityGranted?: boolean;
  oracleSettings?: { defaultTilt?: 'even' | 'ask' };
}

export interface SoloActorCondition {
  id: string;
  key: string;
  name: string;
  description?: string | null;
}

export interface SoloActorInventoryItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  equipped: boolean;
  properties?: { category?: string | null };
}

export interface SoloActor {
  id: string;
  name: string;
  portraitUrl?: string | null;
  description?: string | null;
  hp: { current: number; max: number };
  wp: { current: number; max: number };
  conditions: SoloActorCondition[];
  attributes?: Record<string, number>;
  skills?: Record<string, number>;
  markedSkills?: string[];
  isRallied: boolean;
  deathRolls: { passed: number; failed: number };
  lifeStatus: 'active' | 'dying' | 'dead';
  armor?: number | null;
  inventory: SoloActorInventoryItem[];
  tags: string[];
}

export interface SoloCharacterInjury {
  id: string;
  key: string;
  name: string;
  effect: string;
  healingDays?: number | null;
  remainingHealingShifts?: number | null;
  remainingHealingDays?: number | null;
  permanent: boolean;
  status: 'active' | 'healed';
  recoveryStatus: 'untreated' | 'recovering' | 'healed' | 'permanent';
  medicalCareApplied: boolean;
  treatmentAttempts: number;
  lastTreatmentShift?: number | null;
  healedAt?: string | null;
  resolutionReason?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SoloMission {
  id: string;
  title: string;
  objective: string;
  status: 'briefing' | 'active' | 'returning' | 'success' | 'failure' | 'abandoned';
  currentWaypointIndex: number;
  activeThreatId?: string | null;
  discoveredClues: string[];
  storyFlags: Record<string, boolean | string | number>;
  startedAt?: string | null;
}

export interface SoloWaypoint {
  id: string;
  missionId: string;
  position: number;
  kind: 'foreseen' | 'unknown' | 'diversion' | 'return_route';
  status: 'hidden' | 'revealed' | 'active' | 'resolved' | 'bypassed';
  title?: string | null;
  description?: string | null;
  dangerIds: string[];
  npcIds: string[];
  encounterId?: string | null;
  notes: string[];
  exploration: {
    searchCount: number;
    scavengeCount: number;
    stretchesSpent: number;
  };
}

export interface SoloThreat {
  id: string;
  missionId: string;
  description: string;
  counter: number;
  recurring: boolean;
  status: 'active' | 'triggered' | 'resolved' | 'removed';
  triggerEffect?: Record<string, unknown>;
}

export interface SoloRecordedRoll {
  id: string;
  purpose: string;
  source: string;
  expression: string;
  dice: number[];
  keptIndices: number[];
  keptValues: number[];
  tableKey?: string | null;
  tableVersion?: string | null;
  result: Record<string, unknown>;
  consequence?: {
    id: string;
    resolutionMode: 'manual' | 'roll_choice';
    options: SoloConsequenceOption[];
    selectedIndex: number | null;
    selectedDescription: string;
    selectedEffect: SoloConsequenceEffect;
    choiceRollId?: string | null;
    appliedSummary: string;
    createdAt: string;
  };
  campaignRevision: number;
  createdAt: string;
}

export interface SoloDanger {
  id: string;
  missionId: string;
  waypointId: string;
  description: string;
  status: 'active' | 'resolved' | 'avoided';
  sourceRollId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoloCharacterOption {
  id: string;
  name: string;
  kin?: string | null;
  profession?: string | null;
  heroicAbilities: string[];
}

export interface SoloHeroicAbilityOption {
  id: string;
  name: string;
  description: string;
  willpowerCost: number | null;
  requirement?: unknown;
  ruleKey?: string | null;
  activationType?: 'manual' | 'passive' | 'contextual' | null;
  selected: boolean;
}

export interface SoloOptions {
  campaignRevision: number;
  solo: SoloCampaignStatus;
  characters: SoloCharacterOption[];
  heroicAbilities: SoloHeroicAbilityOption[];
  rulesets: Array<{ key: string; name: string }>;
  modes: Array<{ key: string; name: string; available: boolean; unavailableReason?: string }>;
  prerequisites: {
    hasCharacter: boolean;
    recommendedSingleCharacter: boolean;
    issues: string[];
  };
}

export interface SoloState {
  campaignRevision: number;
  solo: SoloCampaignStatus;
  playerCharacter?: SoloActor | null;
  soloHeroicAbility?: Omit<SoloHeroicAbilityOption, 'selected'> | null;
  activeSessionId?: string | null;
  currentScene?: Record<string, unknown>;
  activeMission?: SoloMission | null;
  waypoints: SoloWaypoint[];
  currentWaypoint?: SoloWaypoint | null;
  activeThreat?: SoloThreat | null;
  activeDangers: SoloDanger[];
  activeCombat?: { id: string; name: string } | null;
  gameTime: Record<string, unknown>;
  restState: {
    roundRestTaken: boolean;
    stretchRestTaken: boolean;
    shiftCount: number;
    lastRestType?: 'round' | 'stretch' | 'shift' | null;
    lastRestAt?: string | null;
    available: { round: boolean; stretch: boolean; shift: boolean };
  };
  activeInjuries: SoloCharacterInjury[];
  latestRolls: SoloRecordedRoll[];
  allowedNextActions: string[];
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
}

export class SoloApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;

  constructor(status: number, payload: ApiEnvelope<unknown>, fallback: string) {
    super(payload.error?.message || fallback);
    this.status = status;
    this.code = payload.error?.code;
    this.details = payload.error?.details;
  }
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    throw new SoloApiError(response.status, payload, fallback);
  }
  return payload.data;
}

function writeHeaders(revision: number) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'if-match': `"${revision}"`,
    'idempotency-key': crypto.randomUUID(),
  };
}

export interface SoloWriteResult {
  success: true;
  campaign_revision: number;
  event_ids: string[];
  summary: string;
  state_excerpt: Record<string, unknown>;
}

export async function fetchSoloCampaignStatus(partyId: string): Promise<SoloCampaignStatus | null> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo`, {
    headers: { accept: 'application/json' },
  });
  const data = await parseResponse<SoloState>(response, 'Could not load solo campaign status.');
  return data.solo || null;
}

export async function fetchSoloOptions(partyId: string): Promise<SoloOptions> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/options`, {
    headers: { accept: 'application/json' },
  });
  return parseResponse<SoloOptions>(response, 'Could not load solo-mode settings.');
}

export async function fetchSoloState(partyId: string): Promise<SoloState> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo`, {
    headers: { accept: 'application/json' },
  });
  return parseResponse<SoloState>(response, 'Could not load solo-mode status.');
}

export async function enableSoloMode(
  partyId: string,
  revision: number,
  input: {
    playerCharacterId: string;
    mode?: 'custom';
    rulesetVersion?: 'db-solo-v1.2';
    oracleDefaultTilt?: 'even' | 'ask';
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      player_character_id: input.playerCharacterId,
      mode: input.mode || 'custom',
      ruleset_version: input.rulesetVersion || 'db-solo-v1.2',
      oracle_default_tilt: input.oracleDefaultTilt || 'ask',
      reason: 'Campaign GM updated solo-mode settings in Draconi.',
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not enable solo mode.');
}

export async function selectSoloHeroicAbility(
  partyId: string,
  revision: number,
  abilityId: string,
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/heroic-ability`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      ability_id: abilityId,
      reason: 'Campaign GM confirmed the solo character additional heroic ability in Draconi.',
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not update the solo heroic ability.');
}

export async function disableSoloMode(partyId: string, revision: number): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo`, {
    method: 'DELETE',
    headers: writeHeaders(revision),
    body: JSON.stringify({ reason: 'Campaign GM disabled solo mode in Draconi.' }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not disable solo mode.');
}

export type FortuneCategory = 'yes_no' | 'number' | 'scale' | 'power' | 'quality' | 'reaction';
export type FortuneTilt = 'unlikely' | 'even' | 'likely';
export type InspirationColumn = 'action' | 'attribute' | 'thing';
export type SoloCheckType = 'skill' | 'attribute';
export type SoloCheckModifier = 'normal' | 'boon' | 'bane';
export type SoloConsequenceEffect =
  | { type: 'story_event' }
  | { type: 'advance_threat'; amount: 1 | 2 }
  | { type: 'damage'; amount: number; damage_type?: string }
  | { type: 'add_condition'; key: string }
  | { type: 'lose_item'; item_id: string; quantity: number }
  | { type: 'new_danger'; description: string }
  | { type: 'add_diversion_waypoint'; title: string; description: string };

export interface SoloConsequenceOption {
  description: string;
  effect: SoloConsequenceEffect;
}

export async function askSoloFortune(
  partyId: string,
  revision: number,
  input: {
    question: string;
    category: FortuneCategory;
    tilt: FortuneTilt;
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/fortune`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      ...input,
      context: input.context || undefined,
      reason: `The solo player asked Fortune: ${input.question}`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Fortune could not answer the question.');
}

export async function drawSoloInspiration(
  partyId: string,
  revision: number,
  input: { columns: InspirationColumn[]; context?: string },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/inspiration`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      ...input,
      context: input.context || undefined,
      reason: 'The solo player requested creative inspiration.',
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not draw inspiration.');
}

export async function resolveSoloCheck(
  partyId: string,
  revision: number,
  input: {
    checkType: SoloCheckType;
    checkName: string;
    modifier: SoloCheckModifier;
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/checks`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      check_type: input.checkType,
      check_name: input.checkName,
      modifier: input.modifier,
      context: input.context || undefined,
      reason: `The solo player chose to test ${input.checkName} with ${input.modifier === 'normal' ? 'a normal roll' : `a ${input.modifier}`}.`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not resolve the Solo check.');
}

export async function resolveSoloCheckConsequence(
  partyId: string,
  rollId: string,
  revision: number,
  resolution:
    | { mode: 'manual'; consequence: SoloConsequenceOption }
    | { mode: 'roll_choice'; consequences: [SoloConsequenceOption, SoloConsequenceOption] },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/checks/${rollId}/consequence`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify({
        resolution,
        confirmed_by_user: true,
        reason: 'The solo player resolved the failed check with an explicit fail-forward consequence.',
      }),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not resolve the Solo check consequence.');
}

export async function startSoloMission(
  partyId: string,
  revision: number,
  input: {
    title: string;
    objective: string;
    waypointCount: number;
    openingTitle: string;
    openingDescription: string;
    threatDescription: string;
    threatRecurring: boolean;
    threatTriggerEffect?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/missions`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      title: input.title,
      objective: input.objective,
      waypoint_count: input.waypointCount,
      opening_waypoint: {
        title: input.openingTitle,
        description: input.openingDescription,
      },
      threat: {
        description: input.threatDescription,
        recurring: input.threatRecurring,
        trigger_effect: input.threatTriggerEffect
          ? { description: input.threatTriggerEffect }
          : {},
      },
      reason: `The solo player started the mission: ${input.title}`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not start the solo mission.');
}

export async function revealSoloWaypoint(
  partyId: string,
  waypointId: string,
  revision: number,
  input: { title?: string; description?: string; generatedFromRollIds?: string[] },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/waypoints/${waypointId}/reveal`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify({
        title: input.title || undefined,
        description: input.description || undefined,
        generated_from_roll_ids: input.generatedFromRollIds || [],
        reason: 'The solo player resolved the current scene and advanced to the next waypoint.',
      }),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not reveal the next waypoint.');
}

export async function searchSoloWaypoint(
  partyId: string,
  waypointId: string,
  revision: number,
  input: { knownLocation: boolean; context?: string },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/waypoints/${waypointId}/search`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify({
        known_location: input.knownLocation,
        context: input.context || undefined,
        reason: input.knownLocation
          ? 'The solo hero searched a specific known hiding place.'
          : 'The solo hero thoroughly searched the current waypoint.',
      }),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not search the current waypoint.');
}

export async function scavengeSoloWaypoint(
  partyId: string,
  waypointId: string,
  revision: number,
  input: { spendStretch: boolean; context?: string },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/waypoints/${waypointId}/scavenge`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify({
        spend_stretch: input.spendStretch,
        context: input.context || undefined,
        reason: input.spendStretch
          ? 'The solo hero spent a stretch scavenging the current waypoint.'
          : 'The solo hero made a quick scavenge of the current waypoint.',
      }),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not scavenge the current waypoint.');
}

export async function takeSoloRest(
  partyId: string,
  revision: number,
  input: {
    restType: 'round' | 'stretch' | 'shift';
    useHealing: boolean;
    conditionToClear?: string;
    safeLocation: boolean;
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/rest`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      rest_type: input.restType,
      use_healing: input.useHealing,
      condition_to_clear: input.conditionToClear || undefined,
      safe_location: input.safeLocation,
      context: input.context || undefined,
      reason: `The solo player chose a ${input.restType} rest.`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not resolve the solo rest.');
}

export async function resolveSoloDyingAction(
  partyId: string,
  revision: number,
  input: {
    action: 'death_roll' | 'self_rally' | 'life_saving_healing' | 'recover_stabilized';
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/dying/actions`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      action: input.action,
      context: input.context || undefined,
      reason: `The solo player chose the ${input.action.replaceAll('_', ' ')} action at 0 HP.`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not resolve the solo dying action.');
}

export async function resolveSoloNarrativeDamage(
  partyId: string,
  revision: number,
  input: {
    severity: 'unknown' | 'slight' | 'moderate' | 'severe';
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/damage`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      severity: input.severity,
      context: input.context || undefined,
      reason: `The solo player confirmed ${input.severity} narrative damage.`,
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not resolve narrative damage.');
}

export async function resolveSoloInjuryAction(
  partyId: string,
  injuryId: string,
  revision: number,
  input: {
    action: 'medical_care' | 'mark_healed';
    context?: string;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo/injuries/${injuryId}/actions`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      action: input.action,
      confirmed_by_user: true,
      context: input.context || undefined,
      reason: input.action === 'medical_care'
        ? 'The solo player explicitly chose to attempt medical care for this injury.'
        : 'The solo player explicitly confirmed that this injury should be marked healed.',
    }),
  });
  return parseResponse<SoloWriteResult>(response, 'Could not resolve the severe injury action.');
}

export async function advanceSoloThreat(
  partyId: string,
  threatId: string,
  revision: number,
  input: { amount: 1 | 2; reason: string },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/threats/${threatId}/advance`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify(input),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not advance the threat.');
}

export async function completeSoloMission(
  partyId: string,
  missionId: string,
  revision: number,
  input: {
    outcome: 'success' | 'failure' | 'abandoned';
    summary: string;
    rewards?: Record<string, unknown>;
  },
): Promise<SoloWriteResult> {
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${partyId}/solo/missions/${missionId}/complete`,
    {
      method: 'POST',
      headers: writeHeaders(revision),
      body: JSON.stringify({
        ...input,
        rewards: input.rewards || {},
        reason: `The solo player concluded the mission with outcome: ${input.outcome}.`,
      }),
    },
  );
  return parseResponse<SoloWriteResult>(response, 'Could not complete the solo mission.');
}
