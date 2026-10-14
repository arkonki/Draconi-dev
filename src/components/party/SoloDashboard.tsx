import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Brain,
  BookOpen,
  Bed,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Dices,
  Flag,
  Ghost,
  Gauge,
  Heart,
  HeartPulse,
  LockKeyhole,
  MapPin,
  PackageSearch,
  BookMarked,
  MessageSquareText,
  RefreshCw,
  Route,
  ScrollText,
  Search,
  Settings2,
  ShieldQuestion,
  Skull,
  Sparkles,
  Swords,
  Wand2,
  X,
} from 'lucide-react';
import { optimizedImageUrl } from '../../lib/images';
import {
  addSoloWaypoints,
  advanceSoloThreat,
  askSoloFortune,
  completeSoloMission,
  drawSoloInspiration,
  generateSoloNpc,
  fetchSoloState,
  fetchSoloOptions,
  FortuneCategory,
  FortuneTilt,
  InspirationColumn,
  revealSoloWaypoint,
  recordManualSoloTreasureDraw,
  scavengeSoloWaypoint,
  searchSoloWaypoint,
  SoloApiError,
  SoloRecordedRoll,
  SoloWaypoint,
  startSoloMission,
  resolveSoloDyingAction,
  resolveSoloCheck,
  resolveSoloCheckConsequence,
  pushSoloCheck,
  resolveSoloInjuryAction,
  resolveSoloNarrativeDamage,
  resolveSoloNpcBehavior,
  takeSoloRest,
  beginSoloReturn,
  claimSoloAdvancementAbility,
  resolveSoloAdvancement,
  resolveSoloThreat,
  selectSoloMissionMarks,
  setSoloThreat,
  SoloCheckModifier,
  SoloCheckType,
  SoloConsequenceEffect,
  SoloConsequenceOption,
  SoloJournalEvent,
  SoloWriteResult,
} from '../../lib/api/solo';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import type { Character } from '../../types/character';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { CharacterSheetDialog } from '../character/CharacterSheetDialog';
import { Button } from '../shared/Button';
import { SoloNarrator } from './SoloNarrator';
import { SoloNarratorDrawer, SoloNarratorLaunch } from './SoloNarratorPanel';
import { awaitingApprovals } from './narratorToolText';
import { SoloEndStory } from './SoloEndStory';
import { SoloStartStory } from './SoloStartStory';
import { SoloGear } from './SoloGear';
import { useConfirm } from '../../hooks/useConfirm';
import { SoloStoryLibrary } from './SoloStoryLibrary';
import { continueFromStory, type SoloStory } from '../../lib/api/soloStories';
import { fetchNarratorConversation, type NarratorAction } from '../../lib/api/ai';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatCampaignClock } from '../../lib/game/campaignTimeFormat';
import { ScreenLanguageProvider, createTranslator, tr, useScreenLanguage, useT, type ScreenLanguagePreference, type Translator } from '../../i18n/translate';

interface SoloDashboardProps {
  partyId: string;
  partyName: string;
  currentUserId?: string;
  canManage: boolean;
  onOpenSettings: () => void;
}

type SoloAction = 'check' | 'push' | 'consequence' | 'fortune' | 'inspiration' | 'treasure' | 'npc-create' | 'npc-behavior' | 'start-mission' | 'reveal-waypoint' | 'search' | 'scavenge' | 'rest' | 'dying' | 'damage' | 'injury' | 'advance-threat' | 'resolve-threat' | 'set-threat' | 'add-waypoints' | 'return' | 'complete-mission' | 'advancement';
type SoloDashboardTab = 'story' | 'adventure' | 'stories' | 'state' | 'journal' | 'logs';
type SoloConsequenceEffectType = SoloConsequenceEffect['type'];

const standardConditionKeys = new Set(['exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened']);

const fortuneCategories: Array<{ value: FortuneCategory; label: string }> = [
  { value: 'yes_no', label: tr('Yes / No') },
  { value: 'number', label: tr('Number') },
  { value: 'scale', label: tr('Scale') },
  { value: 'power', label: tr('Power') },
  { value: 'quality', label: tr('Quality') },
  { value: 'reaction', label: tr('Reaction') },
];

const inspirationColumns: Array<{ value: InspirationColumn; label: string }> = [
  { value: 'action', label: tr('Action') },
  { value: 'attribute', label: tr('Attribute') },
  { value: 'thing', label: tr('Thing') },
];

function percentage(current: number, maximum: number) {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, (current / maximum) * 100));
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function updatePair<T>(pair: [T, T], index: number, value: T): [T, T] {
  return index === 0 ? [value, pair[1]] : [pair[0], value];
}

function injuryRecoveryLabel(shifts: number | null | undefined, t: Translator) {
  if (shifts === null || shifts === undefined) return t('No natural recovery');
  if (shifts === 0) return t('Healed');
  const days = Math.floor(shifts / 4);
  const remainingShifts = shifts % 4;
  const parts: string[] = [];
  if (days > 0) parts.push(t(days === 1 ? '{count} day' : '{count} days', { count: days }));
  if (remainingShifts > 0) parts.push(t(remainingShifts === 1 ? '{count} shift' : '{count} shifts', { count: remainingShifts }));
  return t('{time} remaining', { time: parts.join(' ') });
}

function rollResultLabel(roll: SoloRecordedRoll) {
  if (typeof roll.result.value === 'string' || typeof roll.result.value === 'number') {
    return String(roll.result.value);
  }
  if (typeof roll.result.phrase === 'string') return roll.result.phrase;
  const labelsFor = (value: unknown): string[] => Array.isArray(value)
    ? value.flatMap((entry) => {
      if (Array.isArray(entry)) return labelsFor(entry);
      if (entry && typeof entry === 'object' && 'label' in entry && typeof entry.label === 'string') {
        return [entry.label];
      }
      return [];
    })
    : [];
  const findings = labelsFor(roll.result.findings ?? roll.result.findingChoices);
  const check = roll.result.check;
  const outcome = check && typeof check === 'object' && 'outcome' in check && typeof check.outcome === 'string'
    ? titleCase(check.outcome)
    : null;
  const criticalEffect = roll.result.criticalEffect;
  const criticalLabel = criticalEffect && typeof criticalEffect === 'object' && 'label' in criticalEffect && typeof criticalEffect.label === 'string'
    ? criticalEffect.label
    : null;
  if (outcome || criticalLabel || findings.length > 0) return [outcome, criticalLabel, findings.join(' + ')].filter(Boolean).join(' · ');
  return null;
}

function treasureCardsAwarded(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, entry) => total + treasureCardsAwarded(entry), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((total, [key, entry]) => (
    key === 'treasureCards' && Number.isInteger(entry) && Number(entry) > 0
      ? total + Number(entry)
      : total + treasureCardsAwarded(entry)
  ), 0);
}

function waypointLabel(waypoint: SoloWaypoint, t: Translator) {
  if (waypoint.status === 'hidden') return t('Unknown waypoint');
  return waypoint.title || t('Waypoint {number}', { number: waypoint.position + 1 });
}

function journalValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) {
    return value.map(String).join(' · ');
  }
  return JSON.stringify(value, null, 2);
}

/**
 * The clock of the story that is under way. The campaign clock keeps running between stories, so the days are counted
 * from the moment this story began; with no story under way there is nothing to show.
 */
export function SoloGameTimeSummary({ gameTime, storyActive = true }: { gameTime: Record<string, unknown>; storyActive?: boolean }) {
  const t = useT();
  if (!storyActive) {
    return <p className="mt-2 text-sm text-stone-500">{t('No story is under way. The clock starts when the next story begins.')}</p>;
  }
  if (Object.keys(gameTime || {}).length === 0) {
    return <p className="mt-2 text-sm text-stone-500">{t('No campaign time has been recorded yet.')}</p>;
  }

  const campaignSeconds = Math.max(0, Math.floor(Number(gameTime.elapsedSeconds) || 0));
  const storyStart = Math.floor(Number(gameTime.storyStartElapsedSeconds));
  const elapsedSeconds = Number.isFinite(storyStart) && storyStart >= 0 && storyStart <= campaignSeconds ? campaignSeconds - storyStart : campaignSeconds;
  const clock = formatCampaignClock(elapsedSeconds);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1a472a] text-[#e8d5b5] shadow-sm">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="text-xl font-black text-stone-900">{t('Day {day}', { day: clock.day })}</div>
          <div className="text-sm font-semibold text-stone-600">{clock.shift} · {clock.time}</div>
        </div>
      </div>
    </div>
  );
}

function journalEventSummary(event: SoloJournalEvent): string | null {
  const keys = ['summary', 'description', 'narration', 'reason', 'title', 'question', 'outcome'];
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function recordedRollFromWrite(result: SoloWriteResult): SoloRecordedRoll | null {
  const roll = result.state_excerpt.roll;
  if (!roll || typeof roll !== 'object' || Array.isArray(roll)) return null;
  return roll as SoloRecordedRoll;
}

export function OracleActionResult({
  action,
  result,
  onDone,
}: {
  action: 'fortune' | 'inspiration';
  result: SoloWriteResult;
  onDone: () => void;
}) {
  const t = useT();
  const roll = recordedRollFromWrite(result);
  const answer = roll?.result.value;
  const phrase = roll?.result.phrase;
  const question = roll?.result.question;
  const extreme = roll?.result.extreme === true;
  const notice = result.state_excerpt.notice;
  const inspirationResults = Array.isArray(roll?.result.results)
    ? roll.result.results.filter((entry): entry is Record<string, unknown> => (
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    ))
    : [];
  const primaryResult = action === 'fortune'
    ? (typeof answer === 'string' || typeof answer === 'number' ? String(answer) : result.summary)
    : (typeof phrase === 'string' ? phrase : result.summary);

  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-amber-50 p-5 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
          {action === 'fortune' ? <Gauge className="h-6 w-6" /> : <Wand2 className="h-6 w-6" />}
        </div>
        <div className="mt-3 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">
          {t(action === 'fortune' ? 'Fortune answers' : 'Inspiration drawn')}
        </div>
        <div className="mt-2 font-serif text-3xl font-bold text-stone-950">{primaryResult}</div>
        {action === 'fortune' && typeof question === 'string' && (
          <p className="mt-3 text-sm italic text-stone-600">“{question}”</p>
        )}
        {extreme && (
          <span className="mt-3 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{t('Extreme result')}</span>
        )}
      </div>

      {action === 'inspiration' && inspirationResults.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {inspirationResults.map((entry, index) => (
            <div key={`${String(entry.column || 'result')}-${index}`} className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-500">{titleCase(String(entry.column || 'result'))}</div>
              <div className="mt-1 font-bold text-indigo-950">{String(entry.keyword || '—')}</div>
              {typeof entry.roll === 'number' && <div className="mt-1 text-xs text-indigo-600">D20: {entry.roll}</div>}
            </div>
          ))}
        </div>
      )}

      {roll && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">{roll.expression}</span>
            <span>{t('Rolled:')} <strong>{roll.dice.join(', ')}</strong></span>
          </div>
          {action === 'fortune' && roll.keptValues.length > 0 && (
            <div className="mt-1 text-xs text-stone-500">{t('Kept result: {keptValues}', { keptValues: roll.keptValues.join(', ') })}</div>
          )}
        </div>
      )}

      {typeof notice === 'string' && (
        <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">{notice}</p>
      )}

      <Button type="button" fullWidth icon={CheckCircle2} onClick={onDone}>{t('Done')}</Button>
    </div>
  );
}

function ActionModal({
  action,
  busy,
  error,
  onClose,
  children,
}: {
  action: SoloAction;
  busy: boolean;
  error?: Error | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const titles: Record<SoloAction, string> = {
    check: t('Resolve a Solo check'),
    push: t('Push the failed Solo check'),
    consequence: t('Resolve the complication'),
    fortune: t('Ask Fortune'),
    inspiration: t('Draw Inspiration'),
    treasure: t('Record physical treasure cards'),
    'npc-create': t('Create a simple NPC'),
    'npc-behavior': t('Resolve NPC behavior'),
    'start-mission': t('Start a custom mission'),
    'reveal-waypoint': t('Reveal the next waypoint'),
    search: t('Search the current waypoint'),
    scavenge: t('Scavenge the current waypoint'),
    rest: t('Rest and recover'),
    dying: t('Resolve a dying action'),
    damage: t('Resolve narrative damage'),
    injury: t('Treat a severe injury'),
    'advance-threat': t('Advance the threat'),
    'resolve-threat': t('Resolve the triggered threat'),
    'set-threat': t('Set a replacement threat'),
    'add-waypoints': t('Add route waypoints'),
    return: t('Begin the return journey'),
    'complete-mission': t('Conclude the mission'),
    advancement: t('Mission advancement'),
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={titles[action]} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
            <Sparkles className="h-5 w-5 text-indigo-600" /> {titles[action]}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-40" aria-label={t('Close action')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">
          {children}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error.message}
              {error instanceof SoloApiError && error.code === 'REVISION_CONFLICT' && (
                <span className="mt-1 block text-xs">{t('The campaign changed elsewhere. State was refreshed; review and try again.')}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SoloDashboard({ partyId, partyName, currentUserId, canManage, onOpenSettings }: SoloDashboardProps) {
  const queryClient = useQueryClient();
  const {
    character: viewedSheetCharacter,
    isLoading: isCharacterSheetLoading,
    error: characterSheetError,
    fetchCharacter: fetchCharacterSheetData,
    setCharacter: setViewedSheetCharacter,
  } = useCharacterSheetStore();
  const [activeAction, setActiveAction] = useState<SoloAction | null>(null);
  const [activeDashboardTab, setActiveDashboardTab] = useState<SoloDashboardTab>('story');
  const [endStoryOpen, setEndStoryOpen] = useState(false);
  const [narratorOpen, setNarratorOpen] = useState(false);
  const [startStory, setStartStory] = useState<{ idea: string } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oracleActionResult, setOracleActionResult] = useState<SoloWriteResult | null>(null);
  const [isCharacterSheetOpen, setIsCharacterSheetOpen] = useState(false);
  const previousViewedCharacterRef = useRef<Character | null>(null);
  const activeSheetRequestIdRef = useRef(0);
  const shouldRestoreCharacterContextRef = useRef(false);

  const [checkType, setCheckType] = useState<SoloCheckType>('skill');
  const [checkName, setCheckName] = useState('');
  const [checkModifier, setCheckModifier] = useState<SoloCheckModifier>('normal');
  const [checkContext, setCheckContext] = useState('');
  const [pushRollId, setPushRollId] = useState<string | null>(null);
  const [pushCost, setPushCost] = useState<'condition' | 'sole_survivor'>('condition');
  const [pushCondition, setPushCondition] = useState('');
  const [pushExplanation, setPushExplanation] = useState('');
  const [consequenceRollId, setConsequenceRollId] = useState<string | null>(null);
  const [consequenceMode, setConsequenceMode] = useState<'manual' | 'roll_choice'>('manual');
  const [consequenceDescriptions, setConsequenceDescriptions] = useState<[string, string]>(['', '']);
  const [consequenceEffectTypes, setConsequenceEffectTypes] = useState<[SoloConsequenceEffectType, SoloConsequenceEffectType]>(['story_event', 'story_event']);
  const [consequenceAmounts, setConsequenceAmounts] = useState<[number, number]>([1, 1]);
  const [consequenceDetails, setConsequenceDetails] = useState<[string, string]>(['', '']);
  const [consequenceWaypointDescriptions, setConsequenceWaypointDescriptions] = useState<[string, string]>(['', '']);
  const [consequenceItemIds, setConsequenceItemIds] = useState<[string, string]>(['', '']);

  const [fortuneQuestion, setFortuneQuestion] = useState('');
  const [fortuneCategory, setFortuneCategory] = useState<FortuneCategory>('yes_no');
  const [fortuneTilt, setFortuneTilt] = useState<FortuneTilt>('even');
  const [fortuneContext, setFortuneContext] = useState('');

  const [selectedColumns, setSelectedColumns] = useState<InspirationColumn[]>(['action', 'attribute', 'thing']);
  const [inspirationContext, setInspirationContext] = useState('');
  const [npcName, setNpcName] = useState('');
  const [npcTemplate, setNpcTemplate] = useState<'minion' | 'boss'>('minion');
  const [npcRoles, setNpcRoles] = useState<Array<'melee' | 'ranged' | 'sneaky' | 'magic'>>(['melee']);
  const [npcNotes, setNpcNotes] = useState('');
  const [selectedNpcId, setSelectedNpcId] = useState('');
  const [npcBehavior, setNpcBehavior] = useState<'attack' | 'intent' | 'morale'>('attack');
  const [npcBehaviorRole, setNpcBehaviorRole] = useState<'melee' | 'ranged' | 'sneaky' | 'magic'>('melee');
  const [npcOracle, setNpcOracle] = useState<'fortune' | 'inspiration'>('fortune');
  const [npcQuestion, setNpcQuestion] = useState('');
  const [npcTilt, setNpcTilt] = useState<FortuneTilt>('even');
  const [npcDisposition, setNpcDisposition] = useState<'fled' | 'surrendered'>('fled');
  const [npcActionResult, setNpcActionResult] = useState<SoloWriteResult | null>(null);
  const [treasureCardCount, setTreasureCardCount] = useState(1);
  const [treasureCards, setTreasureCards] = useState<Array<{ title: string; contents: string }>>([{ title: '', contents: '' }]);
  const [treasureShuffled, setTreasureShuffled] = useState(false);
  const [treasureReturnedShuffled, setTreasureReturnedShuffled] = useState(false);
  const [treasureNotes, setTreasureNotes] = useState('');
  const [treasureSourceRollId, setTreasureSourceRollId] = useState<string | null>(null);
  const [treasureActionResult, setTreasureActionResult] = useState<SoloWriteResult | null>(null);
  const [explorationActionResult, setExplorationActionResult] = useState<SoloWriteResult | null>(null);

  const [missionTitle, setMissionTitle] = useState('');
  const [missionObjective, setMissionObjective] = useState('');
  const [unknownWaypointCount, setUnknownWaypointCount] = useState(1);
  const [foreseenWaypointsText, setForeseenWaypointsText] = useState('');
  const [openingTitle, setOpeningTitle] = useState('Departure');
  const [openingDescription, setOpeningDescription] = useState('');
  const [threatDescription, setThreatDescription] = useState('');
  const [threatRecurring, setThreatRecurring] = useState(false);
  const [threatEffect, setThreatEffect] = useState('');

  const [revealTitle, setRevealTitle] = useState('');
  const [revealDescription, setRevealDescription] = useState('');
  const [searchContext, setSearchContext] = useState('');
  const [knownSearchLocation, setKnownSearchLocation] = useState(false);
  const [knownSearchNature, setKnownSearchNature] = useState(false);
  const [scavengeContext, setScavengeContext] = useState('');
  const [scavengeStretch, setScavengeStretch] = useState(false);
  const [restType, setRestType] = useState<'round' | 'stretch' | 'shift'>('round');
  const [restUseHealing, setRestUseHealing] = useState(false);
  const [restCondition, setRestCondition] = useState('');
  const [restSafeLocation, setRestSafeLocation] = useState(false);
  const [restContext, setRestContext] = useState('');
  const [dyingAction, setDyingAction] = useState<'death_roll' | 'self_rally' | 'life_saving_healing' | 'recover_stabilized'>('death_roll');
  const [dyingContext, setDyingContext] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<'unknown' | 'slight' | 'moderate' | 'severe'>('unknown');
  const [damageContext, setDamageContext] = useState('');
  const [selectedInjuryId, setSelectedInjuryId] = useState<string | null>(null);
  const [injuryAction, setInjuryAction] = useState<'medical_care' | 'mark_healed'>('medical_care');
  const [injuryContext, setInjuryContext] = useState('');
  const [threatAmount, setThreatAmount] = useState<1 | 2>(1);
  const [threatReason, setThreatReason] = useState('');
  const [threatResolution, setThreatResolution] = useState('');
  const [replacementThreatDescription, setReplacementThreatDescription] = useState('');
  const [replacementThreatEffect, setReplacementThreatEffect] = useState('');
  const [replacementThreatRecurring, setReplacementThreatRecurring] = useState(false);
  const [addedWaypointCount, setAddedWaypointCount] = useState(1);
  const [addedWaypointKind, setAddedWaypointKind] = useState<'unknown' | 'diversion'>('diversion');
  const [returnRouteType, setReturnRouteType] = useState<'cleared' | 'dangerous' | 'alternative'>('cleared');
  const [returnCheckSkill, setReturnCheckSkill] = useState<'Awareness' | 'Sneaking'>('Awareness');
  const [selectedAdvancementSkills, setSelectedAdvancementSkills] = useState<string[]>([]);
  const [advancementAbilityId, setAdvancementAbilityId] = useState('');
  const [missionOutcome, setMissionOutcome] = useState<'success' | 'failure' | 'abandoned'>('success');
  const [missionSummary, setMissionSummary] = useState('');

  const stateQuery = useQuery({
    queryKey: ['solo-state', partyId],
    queryFn: () => fetchSoloState(partyId),
    staleTime: 0,
  });
  const state = stateQuery.data;
  // The narrator lives in its own panel above all the tabs, so its conversation is read here too (the same cached query).
  const narratorConversation = useQuery({ queryKey: ['solo-narrator', partyId], queryFn: () => fetchNarratorConversation(partyId), enabled: canManage });
  const narratorWaiting = awaitingApprovals(narratorConversation.data);
  // The screens follow the language the story is told in, unless this person chose another one for themselves.
  const { language: screenLanguage, preference: screenPreference, setPreference: setScreenPreference } = useScreenLanguage(state?.solo.narrationLanguage);
  const t = useMemo(() => createTranslator(screenLanguage), [screenLanguage]);
  /** A word from the game's data (a status, a role, a condition) in the screen language. */
  const tc = (value: string) => t(titleCase(value));
  // A finished mission leaves an advancement to do. When one appears while the page is open, bring it up straight away
  // (the end-of-story wizard runs it itself, so it stays out of the way then).
  const seenAdvancement = useRef<string | null | undefined>(undefined);
  const endStoryOpenRef = useRef(false);
  endStoryOpenRef.current = endStoryOpen;
  useEffect(() => {
    if (!state) return;
    const current = state.pendingAdvancement && !state.activeMission ? state.pendingAdvancement.id : null;
    if (seenAdvancement.current !== undefined && current && current !== seenAdvancement.current && canManage && !endStoryOpenRef.current) openAction('advancement');
    seenAdvancement.current = current;
  }, [state?.pendingAdvancement?.id, state?.activeMission?.id]);
  const optionsQuery = useQuery({
    queryKey: ['solo-settings', partyId],
    queryFn: () => fetchSoloOptions(partyId),
    enabled: Boolean(state?.pendingAdvancement),
    staleTime: 0,
  });
  const selectedInjury = state?.activeInjuries.find((injury) => injury.id === selectedInjuryId) || null;
  const selectedNpc = state?.npcs?.find((npc) => npc.id === selectedNpcId) || null;
  const soloCharacterId = state?.solo.playerCharacterId || state?.playerCharacter?.id || null;
  const isSoloCharacterSheetReady = Boolean(
    soloCharacterId && viewedSheetCharacter?.id === soloCharacterId,
  );

  const restorePreviousCharacterContext = () => {
    const previousCharacter = previousViewedCharacterRef.current;
    previousViewedCharacterRef.current = null;
    shouldRestoreCharacterContextRef.current = false;
    setViewedSheetCharacter(previousCharacter ?? null);
  };

  const loadSoloCharacterSheet = (characterId: string, userId: string) => {
    shouldRestoreCharacterContextRef.current = false;
    const requestId = ++activeSheetRequestIdRef.current;

    void fetchCharacterSheetData(characterId, userId).finally(() => {
      if (activeSheetRequestIdRef.current !== requestId) return;
      if (shouldRestoreCharacterContextRef.current) restorePreviousCharacterContext();
    });
  };

  const handleOpenCharacterSheet = () => {
    if (!soloCharacterId || !currentUserId) return;
    if (!isCharacterSheetOpen) {
      previousViewedCharacterRef.current = useCharacterSheetStore.getState().character;
    }
    setIsCharacterSheetOpen(true);
    loadSoloCharacterSheet(soloCharacterId, currentUserId);
  };

  const handleCloseCharacterSheet = () => {
    setIsCharacterSheetOpen(false);
    shouldRestoreCharacterContextRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
    void queryClient.invalidateQueries({ queryKey: ['party', partyId] });
    if (!isCharacterSheetLoading) restorePreviousCharacterContext();
  };

  const handleRetryCharacterSheet = () => {
    if (!soloCharacterId || !currentUserId) return;
    loadSoloCharacterSheet(soloCharacterId, currentUserId);
  };

  useEffect(() => () => {
    if (previousViewedCharacterRef.current || shouldRestoreCharacterContextRef.current) {
      restorePreviousCharacterContext();
    }
  }, []);

  const realtimeBindings = useMemo(() => [{
    bindingId: 'solo-campaign-event',
    event: 'INSERT' as const,
    schema: 'public' as const,
    table: 'campaign_events',
    filter: `campaign_id=eq.${partyId}`,
  }], [partyId]);

  useRealtimeChannel({
    key: `solo-dashboard:${partyId}`,
    scope: `party:${partyId}`,
    bindings: realtimeBindings,
    enabled: Boolean(partyId),
    fallbackRefetchMs: 20_000,
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
      void queryClient.invalidateQueries({ queryKey: ['party', partyId] });
    },
    onReconnect: async () => {
      await queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
    },
  });

  const orderedWaypoints = useMemo(
    () => [...(state?.waypoints || [])].sort((left, right) => left.position - right.position),
    [state?.waypoints],
  );
  const nextWaypoint = state?.activeMission
    ? orderedWaypoints.find((waypoint) => waypoint.position === state.activeMission!.currentWaypointIndex + 1) || null
    : null;
  const finalWaypointPosition = orderedWaypoints.length > 0
    ? Math.max(...orderedWaypoints.map((waypoint) => waypoint.position))
    : -1;
  const atFinalWaypoint = Boolean(
    state?.activeMission && state.activeMission.currentWaypointIndex === finalWaypointPosition,
  );
  const atObjectiveWaypoint = Boolean(
    state?.activeMission?.objectiveWaypointId
    && state.currentWaypoint?.id === state.activeMission.objectiveWaypointId,
  );
  const canCompleteSuccessfully = Boolean(
    atObjectiveWaypoint || (state?.activeMission?.status === 'returning' && atFinalWaypoint),
  );

  const consequenceOption = (index: 0 | 1): SoloConsequenceOption => {
    const type = consequenceEffectTypes[index];
    let effect: SoloConsequenceEffect;
    if (type === 'advance_threat') {
      effect = { type, amount: consequenceAmounts[index] >= 2 ? 2 : 1 };
    } else if (type === 'damage') {
      effect = {
        type,
        amount: Math.max(1, Math.round(consequenceAmounts[index])),
        damage_type: consequenceDetails[index].trim() || undefined,
      };
    } else if (type === 'add_condition') {
      effect = { type, key: consequenceDetails[index].trim() };
    } else if (type === 'lose_item') {
      effect = {
        type,
        item_id: consequenceItemIds[index],
        quantity: Math.max(1, Math.round(consequenceAmounts[index])),
      };
    } else if (type === 'new_danger') {
      effect = { type, description: consequenceDetails[index].trim() };
    } else if (type === 'add_diversion_waypoint') {
      effect = {
        type,
        title: consequenceDetails[index].trim(),
        description: consequenceWaypointDescriptions[index].trim(),
      };
    } else {
      effect = { type: 'story_event' };
    }
    return { description: consequenceDescriptions[index].trim(), effect };
  };

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!state || !activeAction) throw new Error(t('Solo state is not ready.'));
      const revision = state.campaignRevision;
      switch (activeAction) {
        case 'check':
          return resolveSoloCheck(partyId, revision, {
            checkType,
            checkName,
            modifier: checkModifier,
            context: checkContext.trim(),
          });
        case 'push':
          if (!pushRollId) throw new Error(t('Choose the failed Solo check to push.'));
          return pushSoloCheck(partyId, pushRollId, revision, {
            cost: pushCost,
            condition: pushCost === 'condition' ? pushCondition : undefined,
            explanation: pushExplanation.trim(),
          });
        case 'consequence': {
          if (!consequenceRollId) throw new Error(t('Choose the failed Solo check to resolve.'));
          const first = consequenceOption(0);
          return resolveSoloCheckConsequence(
            partyId,
            consequenceRollId,
            revision,
            consequenceMode === 'manual'
              ? { mode: 'manual', consequence: first }
              : { mode: 'roll_choice', consequences: [first, consequenceOption(1)] },
          );
        }
        case 'fortune':
          return askSoloFortune(partyId, revision, {
            question: fortuneQuestion.trim(),
            category: fortuneCategory,
            tilt: fortuneTilt,
            context: fortuneContext.trim(),
          });
        case 'inspiration':
          return drawSoloInspiration(partyId, revision, {
            columns: selectedColumns,
            context: inspirationContext.trim(),
          });
        case 'npc-create':
          return generateSoloNpc(partyId, revision, {
            name: npcName.trim(),
            template: npcTemplate,
            roles: npcRoles,
            missionId: state.activeMission?.id,
            waypointId: state.currentWaypoint?.id,
            notes: npcNotes.trim() || undefined,
          });
        case 'npc-behavior':
          if (!selectedNpc) throw new Error(t('Choose an active Solo NPC.'));
          return resolveSoloNpcBehavior(partyId, selectedNpc.id, revision, {
            behavior: npcBehavior,
            role: npcBehavior === 'attack' ? npcBehaviorRole : undefined,
            oracle: npcBehavior === 'intent' ? npcOracle : 'fortune',
            question: npcQuestion.trim() || undefined,
            tilt: npcTilt,
            disposition: npcBehavior === 'morale' ? npcDisposition : undefined,
            encounterId: state.activeCombat?.id,
          });
        case 'start-mission':
          {
            const foreseenWaypoints = foreseenWaypointsText.split('\n')
              .map((line) => line.trim()).filter(Boolean).map((line) => {
                const [title, ...description] = line.split('::');
                return { title: title.trim(), description: description.join('::').trim() };
              });
          return startSoloMission(partyId, revision, {
            title: missionTitle.trim(),
            objective: missionObjective.trim(),
            waypointCount: foreseenWaypoints.length + unknownWaypointCount + 2,
            unknownWaypointCount,
            foreseenWaypoints,
            openingTitle: openingTitle.trim(),
            openingDescription: openingDescription.trim(),
            threatDescription: threatDescription.trim(),
            threatRecurring,
            threatTriggerEffect: threatEffect.trim(),
          });
          }
        case 'reveal-waypoint':
          if (!nextWaypoint) throw new Error(t('There is no next waypoint to reveal.'));
          return revealSoloWaypoint(partyId, nextWaypoint.id, revision, {
            title: nextWaypoint.kind === 'unknown' ? revealTitle.trim() : undefined,
            description: nextWaypoint.kind === 'unknown' ? revealDescription.trim() : undefined,
          });
        case 'search':
          if (!state.currentWaypoint) throw new Error(t('There is no active waypoint to search.'));
          return searchSoloWaypoint(partyId, state.currentWaypoint.id, revision, {
            knownLocation: knownSearchLocation,
            knownNature: knownSearchNature,
            context: searchContext.trim(),
          });
        case 'scavenge':
          if (!state.currentWaypoint) throw new Error(t('There is no active waypoint to scavenge.'));
          return scavengeSoloWaypoint(partyId, state.currentWaypoint.id, revision, {
            spendStretch: scavengeStretch,
            context: scavengeContext.trim(),
          });
        case 'treasure':
          return recordManualSoloTreasureDraw(partyId, revision, {
            cardCount: treasureCardCount,
            cards: treasureCards.map((card) => ({
              title: card.title.trim() || undefined,
              contents: card.contents.trim(),
            })),
            shuffledBeforeDraw: treasureShuffled,
            returnedAndShuffled: treasureReturnedShuffled,
            missionId: state.activeMission?.id,
            waypointId: state.currentWaypoint?.id,
            sourceRollId: treasureSourceRollId || undefined,
            notes: treasureNotes.trim() || undefined,
          });
        case 'rest':
          return takeSoloRest(partyId, revision, {
            restType,
            useHealing: restType === 'stretch' && restUseHealing,
            conditionToClear: restType === 'stretch' ? restCondition || undefined : undefined,
            safeLocation: restType === 'shift' && restSafeLocation,
            context: restContext.trim(),
          });
        case 'dying':
          return resolveSoloDyingAction(partyId, revision, {
            action: dyingAction,
            context: dyingContext.trim(),
          });
        case 'damage':
          return resolveSoloNarrativeDamage(partyId, revision, {
            severity: damageSeverity,
            context: damageContext.trim(),
          });
        case 'injury':
          if (!selectedInjury) throw new Error(t('Choose an active severe injury.'));
          return resolveSoloInjuryAction(partyId, selectedInjury.id, revision, {
            action: injuryAction,
            context: injuryContext.trim(),
          });
        case 'advance-threat':
          if (!state.activeThreat) throw new Error(t('There is no active threat.'));
          return advanceSoloThreat(partyId, state.activeThreat.id, revision, {
            amount: threatAmount,
            reason: threatReason.trim(),
          });
        case 'resolve-threat':
          if (!state.activeThreat) throw new Error(t('There is no triggered threat.'));
          return resolveSoloThreat(partyId, state.activeThreat.id, revision, threatResolution.trim());
        case 'set-threat':
          return setSoloThreat(partyId, revision, {
            description: replacementThreatDescription.trim(),
            recurring: replacementThreatRecurring,
            triggerEffect: replacementThreatEffect.trim(),
          });
        case 'add-waypoints':
          return addSoloWaypoints(partyId, revision, {
            count: addedWaypointCount,
            kind: addedWaypointKind,
            generateLocations: true,
          });
        case 'return':
          return beginSoloReturn(partyId, revision, {
            routeType: returnRouteType,
            checkSkill: returnRouteType === 'dangerous' ? returnCheckSkill : undefined,
          });
        case 'advancement':
          throw new Error('The advancement runs through its own buttons.');
        case 'complete-mission':
          if (!state.activeMission) throw new Error(t('There is no active mission.'));
          return completeSoloMission(partyId, state.activeMission.id, revision, {
            outcome: missionOutcome,
            summary: missionSummary.trim(),
          });
      }
    },
    onSuccess: async (result) => {
      setSuccessMessage(result.summary);
      if (activeAction === 'fortune' || activeAction === 'inspiration') {
        setOracleActionResult(result);
      } else if (activeAction === 'npc-behavior') {
        setNpcActionResult(result);
      } else if (activeAction === 'treasure') {
        setTreasureActionResult(result);
      } else if (activeAction === 'search' || activeAction === 'scavenge') {
        setExplorationActionResult(result);
      } else {
        setActiveAction(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-status', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['party', partyId] }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof SoloApiError && error.code === 'REVISION_CONFLICT') {
        await queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
      }
    },
  });

  const advancementMutation = useMutation({
    mutationFn: async (step: 'marks' | 'resolve' | 'ability') => {
      if (!state) throw new Error(t('Solo state is not ready.'));
      if (step === 'marks') return selectSoloMissionMarks(partyId, state.campaignRevision, selectedAdvancementSkills);
      if (step === 'resolve') return resolveSoloAdvancement(partyId, state.campaignRevision);
      if (!advancementAbilityId) throw new Error(t('Choose a heroic ability reward.'));
      return claimSoloAdvancementAbility(partyId, state.campaignRevision, advancementAbilityId);
    },
    onSuccess: async (result) => {
      setSuccessMessage(result.summary);
      setSelectedAdvancementSkills([]);
      setAdvancementAbilityId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['party', partyId] }),
      ]);
    },
  });

  const openAction = (action: SoloAction) => {
    setSuccessMessage(null);
    setOracleActionResult(null);
    actionMutation.reset();
    if (action === 'fortune') {
      setFortuneTilt('even');
    }
    if (action === 'npc-create') {
      setNpcName('');
      setNpcTemplate('minion');
      setNpcRoles(['melee']);
      setNpcNotes('');
    }
    if (action === 'npc-behavior') {
      const npc = state?.npcs?.find((candidate) => candidate.id === selectedNpcId)
        || state?.npcs?.find((candidate) => candidate.status === 'active');
      if (npc) {
        setSelectedNpcId(npc.id);
        setNpcBehaviorRole(npc.roles[0] || 'melee');
      }
      setNpcBehavior('attack');
      setNpcOracle('fortune');
      setNpcQuestion('');
      setNpcTilt('even');
      setNpcDisposition('fled');
      setNpcActionResult(null);
    }
    if (action === 'treasure') {
      setTreasureCardCount(1);
      setTreasureCards([{ title: '', contents: '' }]);
      setTreasureShuffled(false);
      setTreasureReturnedShuffled(false);
      setTreasureNotes('');
      setTreasureSourceRollId(null);
      setTreasureActionResult(null);
    }
    if (action === 'check') {
      const firstSkill = Object.keys(state?.playerCharacter?.skills || {}).sort()[0];
      setCheckType(firstSkill ? 'skill' : 'attribute');
      setCheckName(firstSkill || 'STR');
      setCheckModifier('normal');
      setCheckContext('');
    }
    if (action === 'push') {
      setPushCost('condition');
      setPushCondition('');
      setPushExplanation('');
    }
    if (action === 'consequence') {
      setConsequenceMode('manual');
      setConsequenceDescriptions(['', '']);
      setConsequenceEffectTypes(['story_event', 'story_event']);
      setConsequenceAmounts([1, 1]);
      setConsequenceDetails(['', '']);
      setConsequenceWaypointDescriptions(['', '']);
      setConsequenceItemIds(['', '']);
    }
    if (action === 'reveal-waypoint') {
      setRevealTitle('');
      setRevealDescription('');
    }
    if (action === 'search') {
      setSearchContext('');
      setKnownSearchLocation(false);
      setKnownSearchNature(false);
      setExplorationActionResult(null);
    }
    if (action === 'scavenge') {
      setScavengeContext('');
      setScavengeStretch(false);
      setExplorationActionResult(null);
    }
    if (action === 'rest') {
      setRestType(state?.restState.available.round ? 'round' : state?.restState.available.stretch ? 'stretch' : 'shift');
      setRestUseHealing(false);
      setRestCondition('');
      setRestSafeLocation(false);
      setRestContext('');
    }
    if (action === 'dying') {
      setDyingAction(Number(state?.playerCharacter?.deathRolls.passed || 0) >= 3 ? 'recover_stabilized' : 'death_roll');
      setDyingContext('');
    }
    if (action === 'damage') {
      setDamageSeverity('unknown');
      setDamageContext('');
    }
    if (action === 'injury') setInjuryContext('');
    if (action === 'advance-threat') {
      setThreatReason('');
    }
    if (action === 'resolve-threat') setThreatResolution('');
    if (action === 'set-threat') {
      setReplacementThreatDescription('');
      setReplacementThreatEffect('');
      setReplacementThreatRecurring(false);
    }
    if (action === 'add-waypoints') {
      setAddedWaypointCount(1);
      setAddedWaypointKind('diversion');
    }
    if (action === 'return') {
      setReturnRouteType('cleared');
      setReturnCheckSkill('Awareness');
    }
    if (action === 'complete-mission') {
      setMissionOutcome(canCompleteSuccessfully ? 'success' : 'failure');
      setMissionSummary('');
    }
    setActiveAction(action);
  };

  /** A button from the narrator: show the rules dialog it points to, filled in. Nothing is rolled until the player confirms. */
  const startNarratorAction = (proposal: NarratorAction) => {
    setActiveDashboardTab('adventure');
    if (proposal.type === 'check') {
      openAction('check');
      setCheckType(proposal.checkType);
      setCheckName(proposal.name);
      setCheckModifier(proposal.modifier);
      setCheckContext(proposal.label);
    } else if (proposal.type === 'search') {
      openAction('search');
      setSearchContext(proposal.context);
    } else if (proposal.type === 'scavenge') {
      openAction('scavenge');
      setScavengeContext(proposal.context);
    } else if (proposal.type === 'npc') {
      openAction('npc-create');
      setNpcName(proposal.name);
      setNpcTemplate(proposal.template);
      setNpcRoles(proposal.roles);
      setNpcNotes(proposal.notes);
    } else if (proposal.type === 'reveal') {
      openAction('reveal-waypoint');
      setRevealTitle(proposal.title);
      setRevealDescription(proposal.description);
    } else if (proposal.type === 'fortune') {
      openAction('fortune');
      setFortuneQuestion(proposal.question);
      setFortuneCategory(fortuneCategories.some((category) => category.value === proposal.category) ? proposal.category as FortuneCategory : 'yes_no');
    } else if (proposal.type === 'rest') {
      openAction('rest');
      setRestType(proposal.rest);
    } else if (proposal.type === 'push') {
      const target = pushableRolls[0];
      if (target) openPushAction(target.id);
    } else if (proposal.type === 'consequence') {
      const target = unresolvedRolls[0];
      if (target) openConsequenceAction(target.id);
    } else if (proposal.type === 'inspiration') {
      openAction('inspiration');
      setInspirationContext(proposal.context);
    } else if (proposal.type === 'damage') {
      openAction('damage');
      setDamageContext(proposal.context);
    } else if (proposal.type === 'threat') {
      setThreatAmount(proposal.amount);
      openAction('advance-threat');
    } else if (proposal.type === 'leave') {
      openAction('return');
    } else if (proposal.type === 'dying') {
      openAction('dying');
    }
  };

  const closeAction = () => {
    setActiveAction(null);
    setOracleActionResult(null);
    setNpcActionResult(null);
    setTreasureActionResult(null);
    setExplorationActionResult(null);
    actionMutation.reset();
  };

  const openTreasureAction = (count = 1, sourceRollId?: string) => {
    openAction('treasure');
    const normalizedCount = Math.max(1, Math.min(20, Math.round(count)));
    setTreasureCardCount(normalizedCount);
    setTreasureCards(Array.from({ length: normalizedCount }, () => ({ title: '', contents: '' })));
    setTreasureSourceRollId(sourceRollId || null);
  };

  const openInjuryAction = (injuryId: string, action: 'medical_care' | 'mark_healed') => {
    setSelectedInjuryId(injuryId);
    setInjuryAction(action);
    openAction('injury');
  };

  const openConsequenceAction = (rollId: string) => {
    setConsequenceRollId(rollId);
    openAction('consequence');
  };

  const openPushAction = (rollId: string) => {
    setPushRollId(rollId);
    openAction('push');
  };

  const submitAction = (event: FormEvent) => {
    event.preventDefault();
    actionMutation.mutate();
  };

  if (stateQuery.isLoading) {
    return <div className="flex min-h-[500px] items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  if (stateQuery.error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="font-bold">{t('Could not load the Solo Dashboard')}</h2>
          <p className="mt-1 text-sm">{stateQuery.error.message}</p>
          <Button className="mt-4" variant="outline" icon={RefreshCw} onClick={() => stateQuery.refetch()}>{t('Try again')}</Button>
        </div>
      </div>
    );
  }

  if (!state?.solo.enabled) {
    return (
      <div className="flex min-h-[500px] items-center justify-center p-6">
        <div className="max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-stone-900">{t('Prepare a solo adventure')}</h2>
          <p className="mt-2 text-stone-600">{t("Choose the campaign's solo hero and additional heroic ability before beginning the adventure.")}</p>
          {canManage ? (
            <Button className="mt-5" icon={Settings2} onClick={onOpenSettings}>{t('Configure Solo Mode')}</Button>
          ) : (
            <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t('A campaign owner or GM must enable Solo Mode.')}</p>
          )}
        </div>
      </div>
    );
  }

  const hero = state.playerCharacter;
  const standardConditions = hero?.conditions.filter((condition) => standardConditionKeys.has(condition.key)) || [];
  const skillOptions = Object.entries(hero?.skills || {}).sort(([left], [right]) => left.localeCompare(right));
  const attributeOptions = ['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA']
    .flatMap((name) => Number.isInteger(hero?.attributes?.[name]) ? [[name, hero!.attributes![name]] as const] : []);
  const threatCounter = state.activeThreat?.counter || 0;
  const journal = state.journal || {
    currentScene: state.currentScene || {},
    openThreads: [],
    sessions: [],
    recentEvents: [],
  };
  const savedScene = journal.currentScene || {};
  const sceneHasContent = Boolean(savedScene.location || savedScene.description || savedScene.situation)
    || ['activeObjects', 'exits', 'dangers'].some((key) => Array.isArray(savedScene[key]) && savedScene[key].length > 0);
  const currentSceneEntries = sceneHasContent ? Object.entries(savedScene).filter(([key]) => key !== 'schemaVersion') : [];
  const activeJournalSession = journal.sessions.find((session) => session.status === 'active') || null;
  const completedJournalSessions = journal.sessions.filter((session) => session.status === 'completed');
  const pushedSourceIds = new Set(state.latestRolls.map((roll) => roll.previousRollId).filter(Boolean));
  const unresolvedRolls = state.latestRolls.filter((roll) => (
    ['solo_check', 'solo_check_push'].includes(String(roll.result.action))
    && roll.result.requiresFailForward === true
    && !roll.consequence
    && !pushedSourceIds.has(roll.id)
  ));
  const pushableRolls = state.latestRolls.filter((roll) => (
    roll.result.action === 'solo_check'
    && roll.result.outcome === 'failure'
    && !roll.previousRollId
    && !pushedSourceIds.has(roll.id)
    && !roll.consequence
  ));
  const recordedTreasureSourceIds = new Set((state.treasureDraws || []).map((draw) => draw.sourceRollId).filter(Boolean));
  const pendingTreasureRolls = state.latestRolls
    .map((roll) => ({
      roll,
      cardCount: roll.result.requiresChoice === true ? 0 : treasureCardsAwarded(roll.result),
    }))
    .filter(({ roll, cardCount }) => cardCount > 0 && !recordedTreasureSourceIds.has(roll.id));
  const dashboardTabs: Array<{ id: SoloDashboardTab; label: string; icon: typeof Route; badge?: number }> = [
    { id: 'story', label: t('Story'), icon: MessageSquareText, badge: state.pendingAdvancement && !state.activeMission ? 1 : undefined },
    { id: 'adventure', label: t('Adventure'), icon: Route, badge: unresolvedRolls.length || undefined },
    { id: 'stories', label: t('Stories'), icon: BookMarked },
    { id: 'state', label: t('State'), icon: HeartPulse, badge: state.activeInjuries.length || undefined },
    { id: 'journal', label: t('Journal'), icon: BookOpen, badge: journal.openThreads.length || undefined },
    { id: 'logs', label: t('Logs'), icon: ScrollText },
  ];

  // Picks a finished story up again: it becomes the narrator's story so far, and the next mission is planned from it.
  const handleContinueStory = async (story: SoloStory) => {
    const confirmed = await confirm({
      title: t('Continue from "{title}"?', { title: story.title }),
      description: t("The narrator's conversation and story so far are replaced by this story. Your journal and the game itself are not touched."),
      confirmText: t('Continue from this story'),
    });
    if (!confirmed) return;
    setPageError(null);
    try {
      await continueFromStory(partyId, story.id);
      await queryClient.invalidateQueries({ queryKey: ['solo-narrator', partyId] });
      setActiveDashboardTab('story');
      setStartStory({ idea: t('Continue after "{title}"', { title: story.title }) });
    } catch (failure) {
      setPageError(failure instanceof Error ? failure.message : t('Could not continue from that story.'));
    }
  };

  // With no mission under way, the Story tab offers to begin the next story.
  const startStoryBanner = canManage && !state.activeMission && !state.pendingAdvancement ? (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-indigo-950"><Flag className="h-5 w-5 text-indigo-600" /> {t('No story is under way')}</h3>
          <p className="mt-1 text-sm text-indigo-900">{t('Start a mission and the narrator can tell it. Give an idea, or let the narrator propose one from what has happened so far.')}</p>
        </div>
        <Button size="sm" icon={Sparkles} className="shrink-0 whitespace-nowrap" onClick={() => setStartStory({ idea: '' })}>{t('Start a new story')}</Button>
      </div>
    </section>
  ) : null;

  // When the mission is over and its advancement has not been done, say so wherever the player is.
  const advancementBanner = canManage && state.pendingAdvancement && !state.activeMission ? (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-amber-950"><Sparkles className="h-5 w-5 text-amber-600" /> {t('Advancement is ready')}</h3>
          <p className="mt-1 text-sm text-amber-800">{t('The mission is over. Mark five skills, roll for them and claim any heroic ability before the next story.')}</p>
        </div>
        <Button size="sm" icon={Sparkles} className="shrink-0 whitespace-nowrap" onClick={() => openAction('advancement')}>{t('Start the advancement')}</Button>
      </div>
    </section>
  ) : null;

  // The tools the player reaches for most, within reach of the story. Everything else is on the Adventure tab.
  const quickTools = canManage ? (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('Quick tools')}>
      <Button size="sm" icon={Dices} disabled={Boolean(state.activeCombat) || !hero || hero.hp.current <= 0} onClick={() => openAction('check')}>{t('Act')}</Button>
      <Button size="sm" icon={Gauge} onClick={() => openAction('fortune')}>{t('Ask Fortune')}</Button>
      <Button size="sm" variant="outline" icon={Wand2} onClick={() => openAction('inspiration')}>{t('Inspire')}</Button>
      <Button size="sm" variant="outline" icon={Bed} disabled={Boolean(state.activeCombat) || !hero || hero.hp.current <= 0} onClick={() => openAction('rest')}>{t('Rest')}</Button>
      {state.currentWaypoint?.status === 'active' && (
        <>
          <Button size="sm" variant="outline" icon={Search} onClick={() => openAction('search')}>{t('Search')}</Button>
          <Button size="sm" variant="outline" icon={PackageSearch} onClick={() => openAction('scavenge')}>{t('Scavenge')}</Button>
        </>
      )}
      {hero && hero.hp.current === 0 && hero.lifeStatus !== 'dead' && (
        <Button size="sm" icon={Skull} onClick={() => openAction('dying')}>{t('Dying action')}</Button>
      )}
      <Button size="sm" variant="ghost" icon={Route} onClick={() => setActiveDashboardTab('adventure')}>{t('Mission and all tools')}</Button>
    </div>
  ) : null;

  // The between-mission advancement, shown in the Mission card and, so it is hard to miss, in a dialog of its own.
  const advancementPanel = state.pendingAdvancement ? (
    <div className="mx-auto max-w-2xl text-left">
      <Sparkles className="h-10 w-10 text-amber-500" />
      <h4 className="mt-3 text-lg font-bold text-stone-900">{t('Mission advancement')}</h4>
      <p className="mt-1 text-sm text-stone-600">{t('Complete the between-mission advancement before starting the next mission.')}</p>
      {state.pendingAdvancement.status === 'selecting_marks' && (
        <div className="mt-4">
          <div className="text-sm font-bold text-stone-800">{t('Choose exactly five unmarked skills')}</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {skillOptions.filter(([name]) => !hero?.markedSkills?.some((marked) => titleCase(marked) === titleCase(name))).map(([name, value]) => (
              <label key={name} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${selectedAdvancementSkills.includes(name) ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'}`}>
                <input type="checkbox" checked={selectedAdvancementSkills.includes(name)} disabled={!selectedAdvancementSkills.includes(name) && selectedAdvancementSkills.length >= 5} onChange={(event) => setSelectedAdvancementSkills((current) => event.target.checked ? [...current, name] : current.filter((skill) => skill !== name))} />
                <span className="flex-1 font-semibold">{name}</span><span>{value}</span>
              </label>
            ))}
          </div>
          {canManage && <Button className="mt-4" loading={advancementMutation.isPending} disabled={selectedAdvancementSkills.length !== 5} onClick={() => advancementMutation.mutate('marks')}>{t('Apply five marks')}</Button>}
        </div>
      )}
      {state.pendingAdvancement.status === 'ready_to_roll' && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="font-bold text-indigo-950">{t('Marks ready: {selectedSkills}', { selectedSkills: state.pendingAdvancement.selectedSkills.join(', ') })}</div>
          <p className="mt-1 text-sm text-indigo-800">{t('Draconi will roll D20 for every marked skill. A roll above the current value improves it by one, to a maximum of 18.')}</p>
          {canManage && <Button className="mt-3" loading={advancementMutation.isPending} onClick={() => advancementMutation.mutate('resolve')}>{t('Roll advancement')}</Button>}
        </div>
      )}
      {state.pendingAdvancement.status === 'claiming_abilities' && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="font-bold text-amber-950">{t('Choose {pendingHeroicAbilities} heroic ability reward(s)', { pendingHeroicAbilities: state.pendingAdvancement.pendingHeroicAbilities })}</div>
          <select value={advancementAbilityId} onChange={(event) => setAdvancementAbilityId(event.target.value)} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm">
            <option value="">{t('Choose heroic ability…')}</option>
            {(optionsQuery.data?.heroicAbilities || []).filter((ability) => !ability.knownByCharacterIds?.includes(hero?.id || '')).map((ability) => <option key={ability.id} value={ability.id}>{ability.name}</option>)}
          </select>
          {canManage && <Button className="mt-3" loading={advancementMutation.isPending} disabled={!advancementAbilityId} onClick={() => advancementMutation.mutate('ability')}>{t('Claim ability')}</Button>}
        </div>
      )}
      {advancementMutation.error && <p className="mt-3 text-sm text-red-700">{advancementMutation.error.message}</p>}
    </div>
  ) : null;

  return (
    <ScreenLanguageProvider value={screenLanguage}>
    <div className="bg-stone-50/70">
      <div className="border-b border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">
              <Sparkles className="h-4 w-4" /> {t('Solo Adventure')}
            </div>
            <h2 className="mt-2 text-2xl font-extrabold">{partyName}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-indigo-100">
              <span className="rounded-full bg-white/10 px-2.5 py-1">{t('Dragonbane Solo v1.2')}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{t('Revision {campaignRevision}', { campaignRevision: state.campaignRevision })}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{t(state.activeSessionId ? 'Session active' : 'No active session')}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-100" title={t('The language of the buttons and texts on this page, for you only')}>
              {t('Screen language')}
              <select
                value={screenPreference}
                onChange={(event) => setScreenPreference(event.target.value as ScreenLanguagePreference)}
                className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs font-normal text-white"
              >
                <option value="same" className="text-stone-900">{t('Same as the story')}</option>
                <option value="en" className="text-stone-900">English</option>
                <option value="et" className="text-stone-900">Eesti</option>
              </select>
            </label>
            {canManage && (
              <Button variant="outline" size="sm" icon={MessageSquareText} onClick={() => setNarratorOpen((open) => !open)} aria-expanded={narratorOpen} className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {t('Narrator')}{narratorWaiting > 0 && <span className="ml-1 rounded-full bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-950">{narratorWaiting}</span>}
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" icon={Settings2} onClick={onOpenSettings} className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {t('Solo settings')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-stone-200 bg-white px-3 sm:px-6">
        <div className="flex min-w-max gap-1" role="tablist" aria-label={t('Solo adventure sections')}>
          {dashboardTabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeDashboardTab === id}
              onClick={() => setActiveDashboardTab(id)}
              className={`flex min-h-12 items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition-colors sm:px-4 ${
                activeDashboardTab === id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {badge ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">{badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {successMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {successMessage}
          </div>
        )}

        {pageError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{pageError}</div>}

        {!canManage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {t('You can follow the solo adventure here. Only the campaign owner or a GM can resolve authoritative Solo actions.')}
          </div>
        )}

        <div className={activeDashboardTab === 'story' || activeDashboardTab === 'adventure' || activeDashboardTab === 'state'
          ? 'grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.75fr)]'
          : 'block'}>
          <div className="flex min-w-0 flex-col gap-5">
            {/* The story comes first, with what needs the player's attention right above it. */}
            {activeDashboardTab === 'story' && advancementBanner}
            {activeDashboardTab === 'story' && startStoryBanner}
            {activeDashboardTab === 'story' && quickTools}
            {activeDashboardTab === 'stories' && <SoloStoryLibrary partyId={partyId} canManage={canManage} onContinue={(story) => void handleContinueStory(story)} />}
            {activeDashboardTab === 'story' && <SoloNarratorLaunch conversation={narratorConversation.data} canUse={canManage} onOpen={() => setNarratorOpen(true)} />}

            {(activeDashboardTab === 'adventure' || activeDashboardTab === 'story') && unresolvedRolls.length > 0 && (
              <section className="order-1 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 font-bold text-amber-950"><AlertTriangle className="h-5 w-5 text-amber-600" /> {t('Complication awaiting resolution')}</h3>
                    <p className="mt-1 text-sm text-amber-800">{t('The latest failed check may be pushed once if eligible, or resolved with a consequence.')}</p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      {pushableRolls.some((roll) => roll.id === unresolvedRolls[0].id) && (
                        <Button size="sm" icon={Dices} onClick={() => openPushAction(unresolvedRolls[0].id)}>{t('Push')}</Button>
                      )}
                      <Button size="sm" variant="outline" icon={AlertTriangle} onClick={() => openConsequenceAction(unresolvedRolls[0].id)}>{t('Take consequence')}</Button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {(activeDashboardTab === 'adventure' || activeDashboardTab === 'story') && pendingTreasureRolls.length > 0 && (
              <section className="order-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 font-bold text-amber-950"><PackageSearch className="h-5 w-5 text-amber-600" /> {t('Physical treasure draw pending')}</h3>
                    <p className="mt-1 text-sm text-amber-800">
                      {t(pendingTreasureRolls[0].cardCount === 1 ? 'The latest result awards {count} treasure card. Shuffle and draw from your official deck, then enter what you drew.' : 'The latest result awards {count} treasure cards. Shuffle and draw from your official deck, then enter what you drew.', { count: pendingTreasureRolls[0].cardCount })}
                    </p>
                  </div>
                  {canManage && (
                    <Button size="sm" icon={PackageSearch} onClick={() => openTreasureAction(pendingTreasureRolls[0].cardCount, pendingTreasureRolls[0].roll.id)}>
                      {t(pendingTreasureRolls[0].cardCount === 1 ? 'Record {count} card' : 'Record {count} cards', { count: pendingTreasureRolls[0].cardCount })}
                    </Button>
                  )}
                </div>
              </section>
            )}

            {activeDashboardTab === 'adventure' && (
            <section className="order-3 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-stone-900"><Route className="h-5 w-5 text-violet-600" /> {t('Current mission')}</h3>
                {state.activeMission && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">{tc(state.activeMission.status)}</span>}
              </div>

              {!state.activeMission ? (
                <div className="px-5 py-10 text-center">
                  {state.pendingAdvancement ? (
                    advancementPanel
                  ) : (
                    <>
                      <Flag className="mx-auto h-10 w-10 text-stone-300" />
                      <h4 className="mt-3 font-bold text-stone-800">{t('No active mission')}</h4>
                      <p className="mt-1 text-sm text-stone-500">{t('Create a custom objective, route, and threat to begin the playable solo loop.')}</p>
                      {canManage && <Button className="mt-5" icon={Flag} onClick={() => setStartStory({ idea: '' })}>{t('Start a mission')}</Button>}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-5 p-5">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{state.activeMission.title}</div>
                    <p className="mt-1 text-lg font-semibold leading-relaxed text-stone-900">{state.activeMission.objective}</p>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-600"><MapPin className="h-4 w-4" /> {t('Current waypoint')}</div>
                    <h4 className="mt-2 font-bold text-violet-950">{state.currentWaypoint?.title || t('Uncharted location')}</h4>
                    {state.currentWaypoint?.description && <p className="mt-1 text-sm leading-relaxed text-violet-900">{state.currentWaypoint.description}</p>}
                    {state.currentWaypoint && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-violet-700">
                        <span className="rounded-full bg-white/70 px-2.5 py-1">{t('Searches {searchCount}', { searchCount: state.currentWaypoint.exploration.searchCount })}</span>
                        <span className="rounded-full bg-white/70 px-2.5 py-1">{t('Scavenges {scavengeCount}', { scavengeCount: state.currentWaypoint.exploration.scavengeCount })}</span>
                        <span className="rounded-full bg-white/70 px-2.5 py-1">{t('Stretches {stretchesSpent}', { stretchesSpent: state.currentWaypoint.exploration.stretchesSpent })}</span>
                      </div>
                    )}
                    {state.activeDangers.filter((danger) => danger.waypointId === state.currentWaypoint?.id).length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-violet-200 pt-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> {t('Active dangers')}</div>
                        {state.activeDangers
                          .filter((danger) => danger.waypointId === state.currentWaypoint?.id)
                          .map((danger) => <div key={danger.id} className="text-sm font-semibold text-red-900">{danger.description}</div>)}
                      </div>
                    )}
                  </div>

                  <ol className="space-y-2">
                    {orderedWaypoints.map((waypoint) => {
                      const active = waypoint.status === 'active';
                      const resolved = waypoint.status === 'resolved';
                      return (
                        <li key={waypoint.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? 'border-violet-300 bg-violet-50' : 'border-stone-200 bg-white'}`}>
                          {waypoint.status === 'hidden'
                            ? <LockKeyhole className="h-4 w-4 shrink-0 text-stone-400" />
                            : resolved
                              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              : <CircleDot className={`h-4 w-4 shrink-0 ${active ? 'text-violet-600' : 'text-stone-400'}`} />}
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-sm font-semibold ${active ? 'text-violet-950' : 'text-stone-700'}`}>{waypointLabel(waypoint, t)}</div>
                            <div className="text-xs text-stone-500">{tc(waypoint.kind)} · {tc(waypoint.status)}</div>
                          </div>
                          <span className="text-xs font-bold text-stone-400">{waypoint.position + 1}</span>
                        </li>
                      );
                    })}
                  </ol>

                  {canManage && (
                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                      {state.currentWaypoint && (
                        <>
                          <Button icon={Search} onClick={() => openAction('search')}>{t('Search')}</Button>
                          <Button variant="outline" icon={PackageSearch} onClick={() => openAction('scavenge')}>{t('Scavenge')}</Button>
                        </>
                      )}
                      {nextWaypoint && (
                        <Button icon={ChevronRight} onClick={() => openAction('reveal-waypoint')}>{t('Reveal next waypoint')}</Button>
                      )}
                      <Button variant="outline" icon={Route} onClick={() => openAction('add-waypoints')}>{t('Add route')}</Button>
                      {atObjectiveWaypoint && state.activeMission.status === 'active' && (
                        <Button variant="outline" icon={Route} onClick={() => openAction('return')}>{t('Leave the site')}</Button>
                      )}
                      <Button variant="outline" icon={Flag} onClick={() => openAction('complete-mission')}>{t('Conclude mission')}</Button>
                    </div>
                  )}
                </div>
              )}
            </section>
            )}

            {activeDashboardTab !== 'adventure' && activeDashboardTab !== 'story' && activeDashboardTab !== 'stories' && (
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-stone-900">
                  {activeDashboardTab === 'state' ? <HeartPulse className="h-5 w-5 text-red-600" /> : activeDashboardTab === 'journal' ? <BookOpen className="h-5 w-5 text-teal-700" /> : <ScrollText className="h-5 w-5 text-amber-700" />}
                  {t(activeDashboardTab === 'state' ? 'Adventure State' : activeDashboardTab === 'journal' ? 'Journal' : 'Event Log')}
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  {activeDashboardTab === 'state'
                    ? t('Current scene and mechanical campaign state at a glance.')
                    : activeDashboardTab === 'journal'
                      ? t('Persistent session memory and unresolved story threads. Entries marked GM remain private.')
                      : t('What was saved to the campaign by the app and by AI assistants, with the saved details. The built-in narrator and any assistant read this same record.')}
                </p>
              </div>

              <div className="space-y-5 p-5">
                {activeDashboardTab === 'state' && (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-teal-800">{t('Current scene')}</h4>
                      {activeJournalSession && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800">{t('Session active')}</span>}
                    </div>
                    {currentSceneEntries.length === 0 ? (
                      <p className="mt-2 text-sm text-teal-900/60">{t('No current scene has been saved yet.')}</p>
                    ) : (
                      <dl className="mt-3 space-y-3">
                        {currentSceneEntries.map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-teal-700">{tc(key)}</dt>
                            <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-teal-950">{journalValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">{t('Game time')}</h4>
                    <SoloGameTimeSummary gameTime={state.gameTime || {}} storyActive={Boolean(state.activeMission) || state.gameTime?.storyStartElapsedSeconds === undefined} />
                  </div>
                </div>
                )}

                {activeDashboardTab === 'journal' && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">{t('Session')}</h4>
                    {activeJournalSession ? (
                      <div className="mt-2">
                        <div className="font-bold text-stone-900">{activeJournalSession.title}</div>
                        {activeJournalSession.startedAt && <div className="mt-1 text-xs text-stone-500">{t('Started {startedAt}', { startedAt: new Date(activeJournalSession.startedAt).toLocaleString() })}</div>}
                        {activeJournalSession.gmNotes && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{t('Private GM notes')}</div>
                            <div className="mt-1 whitespace-pre-wrap">{activeJournalSession.gmNotes}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-stone-500">{t('No active game session.')}</p>
                    )}
                  </div>
                )}

                {activeDashboardTab === 'journal' && state.story && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-800">{t('The story so far')}</h4>
                    <p className="mt-1 text-xs text-indigo-700">{t('One story for everyone: the narrator in this app and any AI assistant connected over MCP read and continue the same record.')}</p>
                    {state.story.storySoFar && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-900">{state.story.storySoFar}</p>}
                    {state.story.recentExchanges.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-semibold text-indigo-800">{t('Latest exchanges with the narrator')}</summary>
                        <ul className="mt-2 space-y-1.5">
                          {state.story.recentExchanges.map((exchange) => (
                            <li key={exchange.at + exchange.role} className="whitespace-pre-wrap text-stone-800"><strong>{exchange.role === 'player' ? t('You') : t('Narrator')}:</strong> {exchange.text}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                {activeDashboardTab === 'journal' && journal.openThreads.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">{t('Unresolved threads · GM')}</h4>
                    <ul className="mt-2 space-y-2">
                      {journal.openThreads.map((thread, index) => (
                        <li key={index} className="whitespace-pre-wrap break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{journalValue(thread)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeDashboardTab === 'logs' && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">{t('Recent journal entries')}</h4>
                  {journal.recentEvents.length === 0 ? (
                    <p className="mt-2 text-sm text-stone-500">{t('Nothing has been saved to the campaign journal yet.')}</p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {journal.recentEvents.map((event) => {
                        const summary = journalEventSummary(event);
                        return (
                          <li key={event.id} className="rounded-lg border border-stone-200 px-3 py-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-sm font-bold text-stone-900">{titleCase(event.type)}</div>
                                {summary && <p className="mt-0.5 text-sm text-stone-700">{summary}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-stone-400">
                                <span className="rounded bg-stone-100 px-1.5 py-0.5">{t(event.sourceType === 'chatgpt' ? 'AI assistant' : event.sourceType === 'system' ? 'System' : 'App')}</span>
                                <span className="rounded bg-stone-100 px-1.5 py-0.5">{tc(event.visibility)}</span>
                                <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                              </div>
                            </div>
                            <details className="mt-2 text-xs text-stone-500">
                              <summary className="cursor-pointer font-semibold hover:text-stone-800">{t('Saved details')}</summary>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-950 p-3 text-stone-100">{JSON.stringify(event.payload, null, 2)}</pre>
                            </details>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
                )}

                {activeDashboardTab === 'journal' && completedJournalSessions.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-stone-600 hover:text-stone-900">{t('Previous session summaries ({length})', { length: completedJournalSessions.length })}</summary>
                    <div className="mt-3 space-y-2">
                      {completedJournalSessions.map((session) => (
                        <div key={session.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div className="text-sm font-bold text-stone-900">{session.title}</div>
                            {session.endedAt && <time className="text-xs text-stone-400" dateTime={session.endedAt}>{new Date(session.endedAt).toLocaleString()}</time>}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{session.summary || t('No summary was saved.')}</p>
                          {session.gmNotes && <p className="mt-2 whitespace-pre-wrap rounded bg-amber-50 p-2 text-xs text-amber-900"><strong>{t('Private GM notes:')}</strong> {session.gmNotes}</p>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
            )}

            {activeDashboardTab === 'adventure' && (
            <section className="order-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><Dices className="h-5 w-5 text-indigo-600" /> {t('Solo tools')}</h3>
                  <p className="mt-1 text-sm text-stone-500">{t('Use an oracle only when the answer is genuinely uncertain.')}</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button icon={Dices} disabled={Boolean(state.activeCombat) || !hero || hero.hp.current <= 0} onClick={() => openAction('check')}>{t('Act')}</Button>
                    <Button icon={Gauge} onClick={() => openAction('fortune')}>{t('Ask Fortune')}</Button>
                    <Button variant="outline" icon={Wand2} onClick={() => openAction('inspiration')}>{t('Inspire')}</Button>
                    <Button variant="outline" icon={PackageSearch} onClick={() => openTreasureAction()}>{t('Treasure')}</Button>
                    <Button variant="outline" icon={Bed} disabled={Boolean(state.activeCombat) || !hero || hero.hp.current <= 0} onClick={() => openAction('rest')}>{t('Rest')}</Button>
                    {hero && hero.hp.current > 0 && (
                      <Button variant="outline" icon={HeartPulse} disabled={Boolean(state.activeCombat)} onClick={() => openAction('damage')}>{t('Narrative damage')}</Button>
                    )}
                    {hero && hero.hp.current === 0 && hero.lifeStatus !== 'dead' && (
                      <Button icon={Skull} onClick={() => openAction('dying')}>{t('Dying action')}</Button>
                    )}
                  </div>
                )}
              </div>
            </section>
            )}

            {activeDashboardTab === 'adventure' && (
            <section className="order-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><PackageSearch className="h-5 w-5 text-amber-600" /> {t('Physical treasure deck')}</h3>
                  <p className="mt-1 text-sm text-stone-500">{t('You shuffle and draw the official cards. Draconi only records the contents you enter.')}</p>
                </div>
                {canManage && <Button variant="outline" icon={PackageSearch} onClick={() => openTreasureAction()}>{t('Record a draw')}</Button>}
              </div>
              {(state.treasureDraws || []).length === 0 ? (
                <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-500">{t('No physical treasure-card draws recorded yet.')}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {state.treasureDraws.slice(0, 3).map((draw) => (
                    <details key={draw.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-stone-900">
                        {t(draw.cardCount === 1 ? '{count} card' : '{count} cards', { count: draw.cardCount })} · {new Date(draw.createdAt).toLocaleString()}
                      </summary>
                      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-stone-700">
                        {draw.cards.map((card, index) => <li key={index}><strong>{card.title || `Card ${index + 1}`}:</strong> {card.contents}</li>)}
                      </ol>
                      {draw.notes && <p className="mt-2 text-xs text-stone-500">{draw.notes}</p>}
                    </details>
                  ))}
                </div>
              )}
            </section>
            )}

            {activeDashboardTab === 'adventure' && (
            <section className="order-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><Ghost className="h-5 w-5 text-violet-600" /> {t('Solo NPCs')}</h3>
                  <p className="mt-1 text-sm text-stone-500">{t('Rules-compliant Minions and Bosses with role-based actions.')}</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" icon={Ghost} onClick={() => openAction('npc-create')}>{t('Create NPC')}</Button>
                    <Button
                      icon={Dices}
                      disabled={!(state.npcs || []).some((npc) => npc.status === 'active')}
                      onClick={() => openAction('npc-behavior')}
                    >{t('Resolve behavior')}</Button>
                  </div>
                )}
              </div>
              {(state.npcs || []).length === 0 ? (
                <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-500">{t('No simple Solo NPCs have been created.')}</p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(state.npcs || []).map((npc) => (
                    <div key={npc.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-stone-900">{npc.name}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${npc.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>{tc(npc.status)}</span>
                      </div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-violet-700">{tc(npc.template)} · {npc.roles.map(tc).join(' / ')}</div>
                      <div className="mt-2 text-xs text-stone-600">{t('HP {hp} · Armor {armor} · Damage {value} · Skill {relevantSkill}', { hp: npc.profile.hp ?? '—', armor: npc.profile.armor || '—', value: npc.profile.damage?.toUpperCase() || '—', relevantSkill: npc.profile.relevantSkill ?? '—' })}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}

            {activeDashboardTab === 'logs' && (
            <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-stone-900"><Dices className="h-5 w-5 text-amber-600" /> {t('Recent authoritative rolls')}</h3>
              </div>
              {state.latestRolls.length === 0 ? (
                <p className="p-5 text-sm text-stone-500">{t('No Solo rolls have been recorded yet.')}</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {state.latestRolls.map((roll) => {
                    const result = rollResultLabel(roll);
                    const needsConsequence = ['solo_check', 'solo_check_push'].includes(String(roll.result.action))
                      && roll.result.requiresFailForward === true
                      && !roll.consequence
                      && !pushedSourceIds.has(roll.id);
                    return (
                      <div key={roll.id} className="p-4 sm:px-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-stone-900">{roll.purpose}</div>
                            {result && <div className="mt-1 text-lg font-extrabold text-indigo-700">{result}</div>}
                          </div>
                          <time className="shrink-0 text-xs text-stone-400" dateTime={roll.createdAt}>{new Date(roll.createdAt).toLocaleString()}</time>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-600">
                          <span className="rounded bg-stone-100 px-2 py-1">{roll.expression}</span>
                          <span>{t('Dice: {dice}', { dice: roll.dice.join(', ') })}</span>
                          {roll.keptValues.length > 0 && <span className="text-indigo-700">{t('Kept: {keptValues}', { keptValues: roll.keptValues.join(', ') })}</span>}
                          {roll.tableVersion && <span className="text-stone-400">{roll.tableVersion}</span>}
                        </div>
                        {roll.consequence && (
                          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                            <div className="font-bold">{t('Complication resolved')}</div>
                            <div className="mt-0.5">{roll.consequence.selectedDescription}</div>
                            <div className="mt-1 text-xs text-emerald-700">{roll.consequence.appliedSummary}</div>
                          </div>
                        )}
                        {canManage && needsConsequence && !state.activeCombat && (
                          <Button className="mt-3" size="sm" icon={AlertTriangle} onClick={() => openConsequenceAction(roll.id)}>
                            {t('Resolve complication')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            )}
          </div>

          {(activeDashboardTab === 'story' || activeDashboardTab === 'adventure' || activeDashboardTab === 'state') && (
          <aside className={`space-y-5 ${activeDashboardTab === 'story' ? '' : 'order-first lg:order-none'}`}>
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-100 font-bold text-indigo-700">
                  {hero?.portraitUrl ? (
                    <img
                      src={optimizedImageUrl(hero.portraitUrl, 'thumbnail')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : hero?.name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!hero || !soloCharacterId || !currentUserId}
                    onClick={handleOpenCharacterSheet}
                    className="group flex max-w-full items-center gap-1.5 text-left text-lg font-bold text-stone-900 hover:text-indigo-700 disabled:cursor-default disabled:hover:text-stone-900"
                    title={hero ? `Open ${hero.name}'s character sheet` : undefined}
                  >
                    <span className="truncate">{hero?.name || t('Solo hero')}</span>
                    {hero && <BookOpen className="h-4 w-4 shrink-0 text-stone-400 transition-colors group-hover:text-indigo-600" />}
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{hero?.tags.join(' · ') || t('Player character')}</p>
                </div>
              </div>

              {hero && (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-bold text-stone-600"><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-red-500" /> {t('HP')}</span><span>{hero.hp.current} / {hero.hp.max}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-red-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${percentage(hero.hp.current, hero.hp.max)}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-bold text-stone-600"><span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5 text-blue-500" /> {t('WP')}</span><span>{hero.wp.current} / {hero.wp.max}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${percentage(hero.wp.current, hero.wp.max)}%` }} /></div>
                  </div>
                </div>
              )}

              {hero?.hp.current === 0 && (
                <div className={`mt-4 rounded-xl border p-3 ${hero.lifeStatus === 'dead' ? 'border-stone-700 bg-stone-900 text-white' : 'border-red-200 bg-red-50 text-red-950'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-bold"><Skull className="h-4 w-4" /> {t(hero.lifeStatus === 'dead' ? 'Dead' : hero.isRallied ? 'Dying · rallied' : 'Dying')}</span>
                    <span className="text-xs font-bold">{t('CON {CON}', { CON: hero.attributes?.CON ?? '—' })}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold">
                    <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">{t('Successes {passed}/3', { passed: hero.deathRolls.passed })}</span>
                    <span className="rounded bg-red-100 px-2 py-1 text-red-800">{t('Failures {failed}/3', { failed: hero.deathRolls.failed })}</span>
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-stone-100 pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('Conditions')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hero?.conditions.length ? hero.conditions.map((condition) => (
                    <span key={condition.id} className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">{tc(condition.name)}</span>
                  )) : <span className="text-sm text-stone-400">{t('None')}</span>}
                </div>
              </div>

              {(activeDashboardTab === 'state' || activeDashboardTab === 'story') && (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Bed className="h-3.5 w-3.5" /> {t('Rest this shift')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${state.restState.available.round ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>{t(state.restState.available.round ? 'Round available' : 'Round used')}</span>
                  <span className={`rounded-full px-2.5 py-1 ${state.restState.available.stretch ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>{t(state.restState.available.stretch ? 'Stretch available' : 'Stretch used')}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-stone-400">{t('Tracked by Solo Rest actions. Character-sheet rests do not update this availability.')}</p>
              </div>
              )}

              {(activeDashboardTab === 'state' || activeDashboardTab === 'story') && state.activeInjuries.length > 0 && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><HeartPulse className="h-3.5 w-3.5" /> {t('Severe injuries')}</div>
                  <div className="mt-2 space-y-2">
                    {state.activeInjuries.map((injury) => (
                      <div key={injury.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
                        <div className="font-bold">{injury.name} · {injury.permanent ? 'permanent' : injuryRecoveryLabel(injury.remainingHealingShifts, t)}</div>
                        <div className="mt-0.5 text-amber-800">{injury.effect}</div>
                        <div className="mt-1 text-[11px] font-semibold text-amber-700">
                          {injury.permanent
                            ? t('Permanent injury')
                            : injury.medicalCareApplied
                              ? t('Medical care applied · recovery time halved')
                              : injury.lastTreatmentShift === state.restState.shiftCount
                                ? t('Medical care already attempted this shift')
                                : t('{status} · original recovery {days} days', { status: t(titleCase(injury.recoveryStatus)), days: injury.healingDays || '—' })}
                        </div>
                        {canManage && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {!injury.permanent && !injury.medicalCareApplied && (
                              <Button
                                size="sm"
                                icon={HeartPulse}
                                disabled={Boolean(state.activeCombat) || injury.lastTreatmentShift === state.restState.shiftCount}
                                onClick={() => openInjuryAction(injury.id, 'medical_care')}
                              >
                                {t('Medical care')}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openInjuryAction(injury.id, 'mark_healed')}>{t('Mark healed')}</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(activeDashboardTab === 'state' || activeDashboardTab === 'story') && (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Sparkles className="h-3.5 w-3.5" /> {t('Solo ability')}</div>
                <div className="mt-1.5 text-sm font-semibold text-stone-800">{state.soloHeroicAbility?.name || t('Not selected')}</div>
              </div>
              )}

              {(activeDashboardTab === 'state' || activeDashboardTab === 'story') && hero && (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <SoloGear hero={hero} />
              </div>
              )}
            </section>

            {activeDashboardTab === 'adventure' && (
            <section className={`rounded-2xl border p-5 shadow-sm ${state.activeThreat ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><AlertTriangle className={`h-5 w-5 ${state.activeThreat ? 'text-amber-600' : 'text-stone-400'}`} /> {t('Threat')}</h3>
                  <p className="mt-1 text-sm text-stone-600">{state.activeThreat?.description || t('No active mission threat.')}</p>
                </div>
                {state.activeThreat && <span className="shrink-0 text-lg font-extrabold text-amber-800">{threatCounter}/6</span>}
              </div>
              {state.activeThreat && (
                <>
                  <div className="mt-4 grid grid-cols-6 gap-1.5" aria-label={`Threat counter ${threatCounter} of 6`}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className={`h-3 rounded-full ${index < threatCounter ? 'bg-amber-500' : 'bg-amber-100'}`} />
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-amber-800">{t(state.activeThreat.recurring ? 'Recurring: resolves at 6, then resets to 1.' : 'One-time: resolve at 6, then replace it while delving.')}</div>
                  {canManage && state.activeThreat.status === 'active' && (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setThreatAmount(1); openAction('advance-threat'); }}>{t('Advance +1')}</Button>
                      <Button size="sm" variant="outline" onClick={() => { setThreatAmount(2); openAction('advance-threat'); }}>{t('Dire +2')}</Button>
                    </div>
                  )}
                  {canManage && state.activeThreat.status === 'triggered' && (
                    <Button className="mt-4" size="sm" icon={AlertTriangle} onClick={() => openAction('resolve-threat')}>{t('Resolve triggered event')}</Button>
                  )}
                </>
              )}
              {canManage && state.activeMission && !state.activeThreat && (
                <Button className="mt-4" size="sm" variant="outline" onClick={() => openAction('set-threat')}>{t('Set replacement threat')}</Button>
              )}
            </section>
            )}

            {activeDashboardTab === 'adventure' && state.activeCombat && (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <h3 className="flex items-center gap-2 font-bold text-red-950"><Swords className="h-5 w-5 text-red-600" /> {t('Combat active')}</h3>
                <p className="mt-1 text-sm text-red-800">{state.activeCombat.name}</p>
              </section>
            )}
          </aside>
          )}
        </div>
      </div>

      <CharacterSheetDialog
        isOpen={isCharacterSheetOpen}
        title={state.playerCharacter?.name || t('Solo hero')}
        soloState={state}
        isLoading={isCharacterSheetLoading}
        isReady={isSoloCharacterSheetReady}
        error={characterSheetError}
        onClose={handleCloseCharacterSheet}
        onRetry={handleRetryCharacterSheet}
        layer="nested"
      />

      {activeAction === 'advancement' && (
        <ActionModal action="advancement" busy={advancementMutation.isPending} error={advancementMutation.error} onClose={closeAction}>
          {advancementPanel ?? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="font-semibold text-stone-800">{t('The advancement is complete.')}</p>
              <Button type="button" fullWidth onClick={closeAction}>{t('Done')}</Button>
            </div>
          )}
        </ActionModal>
      )}

      {startStory && (
        <SoloStartStory
          partyId={partyId}
          initialIdea={startStory.idea}
          onWriteMyself={() => { setStartStory(null); openAction('start-mission'); }}
          onCreated={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
              queryClient.invalidateQueries({ queryKey: ['solo-stories', partyId] }),
            ]);
            setActiveDashboardTab('story');
          }}
          onClose={() => setStartStory(null)}
          blockedReason={state.pendingAdvancement ? t('The last mission\'s advancement is still waiting. Finish it on the Story tab, then begin this mission.') : undefined}
        />
      )}
      {confirmDialog}

      {canManage && (
        <SoloNarratorDrawer open={narratorOpen} onClose={() => setNarratorOpen(false)}>
          <SoloNarrator
            fill
            partyId={partyId}
            partyName={partyName}
            heroId={state.playerCharacter?.id ?? null}
            currentUserId={currentUserId}
            canUse={canManage}
            checkpoint={{
              revision: state.campaignRevision,
              sessionId: state.activeSessionId ?? null,
              sceneLocation: journal.currentScene?.location ? String(journal.currentScene.location) : state.currentWaypoint?.title || '',
              sceneDescription: journal.currentScene?.description ? String(journal.currentScene.description) : '',
            }}
            onStateChanged={() => queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] })}
            onAction={startNarratorAction}
            onEndStory={() => setEndStoryOpen(true)}
          />
        </SoloNarratorDrawer>
      )}

      {endStoryOpen && (
        <SoloEndStory
          partyId={partyId}
          partyName={partyName}
          state={state}
          hero={hero ?? null}
          currentUserId={currentUserId}
          canCompleteSuccessfully={canCompleteSuccessfully}
          advancementPanel={advancementPanel}
          onChanged={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
              queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
              queryClient.invalidateQueries({ queryKey: ['solo-narrator', partyId] }),
              queryClient.invalidateQueries({ queryKey: ['party', partyId] }),
            ]);
          }}
          onStartNext={() => { setEndStoryOpen(false); setStartStory({ idea: '' }); }}
          onClose={() => setEndStoryOpen(false)}
        />
      )}

      {activeAction && activeAction !== 'advancement' && (
        <ActionModal action={activeAction} busy={actionMutation.isPending} error={actionMutation.error} onClose={closeAction}>
          <form onSubmit={submitAction} className="space-y-4">
            {(activeAction === 'fortune' || activeAction === 'inspiration') && oracleActionResult && (
              <OracleActionResult action={activeAction} result={oracleActionResult} onDone={closeAction} />
            )}

            {(activeAction === 'search' || activeAction === 'scavenge') && explorationActionResult && (() => {
              const roll = recordedRollFromWrite(explorationActionResult);
              const rawGroups = roll?.result.findingChoices;
              const findingGroups = Array.isArray(rawGroups) && rawGroups.every(Array.isArray)
                ? rawGroups as Array<Array<Record<string, unknown>>>
                : [Array.isArray(roll?.result.findings) ? roll.result.findings as Array<Record<string, unknown>> : []];
              const requiresChoice = roll?.result.requiresChoice === true && findingGroups.length > 1;
              const totalTreasure = requiresChoice ? 0 : treasureCardsAwarded(findingGroups);
              return (
                <div className="space-y-4" role="status" aria-live="polite">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                    <div className="text-lg font-extrabold">{explorationActionResult.summary}</div>
                    <div className="mt-2 text-xs text-emerald-700">{t('The roll and its time/threat effects are already recorded.')}</div>
                  </div>
                  {requiresChoice ? (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-stone-800">{t('A Dragon produced two possible finds. Choose the one that best fits the fiction before continuing.')}</p>
                      {findingGroups.map((group, index) => {
                        const cardCount = treasureCardsAwarded(group);
                        return (
                          <div key={index} className="rounded-xl border border-stone-200 p-4">
                            <div className="text-xs font-extrabold uppercase tracking-wide text-indigo-600">{t('Choice {index}', { index: index + 1 })}</div>
                            <div className="mt-1 text-sm text-stone-800">{group.map((entry) => String(entry.label || entry.key || t('Finding'))).join(' + ')}</div>
                            <Button className="mt-3" type="button" size="sm" icon={cardCount > 0 ? PackageSearch : CheckCircle2} onClick={() => cardCount > 0 && roll ? openTreasureAction(cardCount, roll.id) : closeAction()}>
                              {cardCount > 0 ? t(cardCount === 1 ? 'Choose and record {count} treasure card' : 'Choose and record {count} treasure cards', { count: cardCount }) : t('Choose this result')}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
                        {findingGroups.flat().map((entry, index) => <div key={index}>{String(entry.label || entry.key || t('Finding'))}</div>)}
                      </div>
                      {totalTreasure > 0 && roll ? (
                        <Button type="button" fullWidth icon={PackageSearch} onClick={() => openTreasureAction(totalTreasure, roll.id)}>{t(totalTreasure === 1 ? 'Record {count} physical treasure card' : 'Record {count} physical treasure cards', { count: totalTreasure })}</Button>
                      ) : (
                        <Button type="button" fullWidth icon={CheckCircle2} onClick={closeAction}>{t('Done')}</Button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {activeAction === 'check' && hero && (
              <>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
                  {t("The server uses {name}'s stored target and records every die. This action is for checks outside combat.", { name: hero.name })}
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Check type')}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['skill', 'attribute'] as const).map((type) => (
                      <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${checkType === type ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-stone-200 text-stone-700'}`}>
                        <input
                          type="radio"
                          name="solo-check-type"
                          checked={checkType === type}
                          onChange={() => {
                            setCheckType(type);
                            setCheckName(type === 'skill' ? skillOptions[0]?.[0] || '' : attributeOptions[0]?.[0] || 'STR');
                          }}
                          className="h-4 w-4 border-stone-300 text-indigo-600"
                        />
                        {tc(type)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-bold text-stone-700">
                  {t(checkType === 'skill' ? 'Skill' : 'Attribute')}
                  <select value={checkName} onChange={(event) => setCheckName(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="">{t('Choose a {checkType}…', { checkType })}</option>
                    {(checkType === 'skill' ? skillOptions : attributeOptions).map(([name, target]) => (
                      <option key={name} value={name}>{titleCase(name)} · {target}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Roll modifier')}
                  <select value={checkModifier} onChange={(event) => setCheckModifier(event.target.value as SoloCheckModifier)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="normal">{t('Normal · 1D20')}</option>
                    <option value="boon">{t('Boon · 2D20, keep lower')}</option>
                    <option value="bane">{t('Bane · 2D20, keep higher')}</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('What is the hero trying to do?')}
                  <textarea value={checkContext} onChange={(event) => setCheckContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Climb the crumbling wall before the patrol returns…')} />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
                  {t('A Dragon or Demon marks the selected skill once and rolls a generic critical-effect prompt. A failure requires a complication that moves the story forward; it does not silently alter HP, inventory, or threat.')}
                </div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!checkName} icon={Dices}>{t('Roll {name}', { name: titleCase(checkName || t('Check')) })}</Button>
              </>
            )}

            {activeAction === 'push' && hero && pushRollId && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {t('Describe how the condition or Sole Survivor effort applies before rerolling. A Demon and an already-pushed roll can never be pushed.')}
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Push cost')}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className={`rounded-lg border p-3 text-sm ${pushCost === 'condition' ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'}`}>
                      <input type="radio" name="push-cost" checked={pushCost === 'condition'} onChange={() => setPushCost('condition')} className="mr-2" /> {t('Take a condition')}
                    </label>
                    <label className={`rounded-lg border p-3 text-sm ${pushCost === 'sole_survivor' ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'} ${state.soloHeroicAbility?.name !== 'Sole Survivor' ? 'opacity-50' : ''}`}>
                      <input type="radio" name="push-cost" checked={pushCost === 'sole_survivor'} disabled={state.soloHeroicAbility?.name !== 'Sole Survivor'} onChange={() => setPushCost('sole_survivor')} className="mr-2" /> {t('Sole Survivor · 3 WP')}
                    </label>
                  </div>
                </fieldset>
                {pushCost === 'condition' && (
                  <label className="block text-sm font-bold text-stone-700">{t('Condition')}
                    <select value={pushCondition} onChange={(event) => setPushCondition(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="">{t('Choose an inactive condition…')}</option>
                      {[...standardConditionKeys].map((key) => <option key={key} value={key} disabled={hero.conditions.some((condition) => condition.key === key)}>{tc(key)}</option>)}
                    </select>
                  </label>
                )}
                <label className="block text-sm font-bold text-stone-700">{t('How does this push apply?')}
                  <textarea value={pushExplanation} onChange={(event) => setPushExplanation(event.target.value)} required maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('I force the rusted gate while my muscles tremble, becoming exhausted…')} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!pushExplanation.trim() || (pushCost === 'condition' && !pushCondition) || (pushCost === 'sole_survivor' && hero.wp.current < 3)} icon={Dices}>{t('Pay cost and reroll')}</Button>
              </>
            )}

            {activeAction === 'consequence' && hero && consequenceRollId && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {t('A failed check must move the story forward. Record one accepted consequence, or provide two reasonable alternatives and let the server choose: 1-3 selects A, 4-6 selects B.')}
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Resolution')}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {([
                      ['manual', t('Accept one consequence')],
                      ['roll_choice', t('Roll between two')],
                    ] as const).map(([mode, label]) => (
                      <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${consequenceMode === mode ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-stone-200 text-stone-700'}`}>
                        <input type="radio" name="consequence-mode" checked={consequenceMode === mode} onChange={() => setConsequenceMode(mode)} className="h-4 w-4 border-stone-300 text-amber-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {(consequenceMode === 'manual' ? [0] : [0, 1]).map((rawIndex) => {
                  const index = rawIndex as 0 | 1;
                  const effectType = consequenceEffectTypes[index];
                  return (
                    <fieldset key={index} className="space-y-3 rounded-xl border border-stone-200 p-4">
                      <legend className="px-1 text-sm font-bold text-stone-800">
                        {consequenceMode === 'manual' ? t('Consequence') : t(index === 0 ? 'Option A · 1-3' : 'Option B · 4-6')}
                      </legend>
                      <label className="block text-sm font-bold text-stone-700">{t('What happens?')}
                        <textarea
                          value={consequenceDescriptions[index]}
                          onChange={(event) => setConsequenceDescriptions((current) => updatePair(current, index, event.target.value))}
                          required
                          maxLength={2000}
                          rows={2}
                          className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal"
                          placeholder={t('The hero succeeds, but the noise alerts something below…')}
                        />
                      </label>
                      <label className="block text-sm font-bold text-stone-700">{t('Mechanical effect')}
                        <select
                          value={effectType}
                          onChange={(event) => setConsequenceEffectTypes((current) => updatePair(current, index, event.target.value as SoloConsequenceEffectType))}
                          className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal"
                        >
                          <option value="story_event">{t('Story event only')}</option>
                          <option value="advance_threat">{t('Advance threat')}</option>
                          <option value="damage">{t('Damage hero')}</option>
                          <option value="add_condition">{t('Add condition')}</option>
                          <option value="lose_item">{t('Lose or expend item')}</option>
                          <option value="new_danger">{t('Add danger here')}</option>
                          <option value="add_diversion_waypoint">{t('Insert diversion waypoint')}</option>
                        </select>
                      </label>
                      {effectType === 'advance_threat' && (
                        <label className="block text-sm font-bold text-stone-700">{t('Threat increase')}
                          <select value={consequenceAmounts[index]} onChange={(event) => setConsequenceAmounts((current) => updatePair(current, index, Number(event.target.value)))} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                            <option value={1}>{t('+1 · normal delay or opening')}</option>
                            <option value={2}>{t('+2 · dire or time-sensitive setback')}</option>
                          </select>
                        </label>
                      )}
                      {effectType === 'damage' && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm font-bold text-stone-700">{t('Damage')}
                            <input type="number" min={1} max={100} value={consequenceAmounts[index]} onChange={(event) => setConsequenceAmounts((current) => updatePair(current, index, Number(event.target.value)))} required className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                          </label>
                          <label className="block text-sm font-bold text-stone-700">{t('Damage type')}<span className="font-normal text-stone-400">{t('optional')}</span>
                            <input value={consequenceDetails[index]} onChange={(event) => setConsequenceDetails((current) => updatePair(current, index, event.target.value))} maxLength={80} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('falling')} />
                          </label>
                        </div>
                      )}
                      {effectType === 'add_condition' && (
                        <label className="block text-sm font-bold text-stone-700">{t('Condition')}
                          <select value={consequenceDetails[index]} onChange={(event) => setConsequenceDetails((current) => updatePair(current, index, event.target.value))} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                            <option value="">{t('Choose a condition…')}</option>
                            {[...standardConditionKeys].map((key) => <option key={key} value={key} disabled={hero.conditions.some((condition) => condition.key === key)}>{tc(key)}</option>)}
                          </select>
                        </label>
                      )}
                      {effectType === 'lose_item' && (
                        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                          <label className="block text-sm font-bold text-stone-700">{t('Item')}
                            <select value={consequenceItemIds[index]} onChange={(event) => setConsequenceItemIds((current) => updatePair(current, index, event.target.value))} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                              <option value="">{t('Choose an item…')}</option>
                              {hero.inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity}</option>)}
                            </select>
                          </label>
                          <label className="block text-sm font-bold text-stone-700">{t('Quantity')}
                            <input type="number" min={1} max={999} value={consequenceAmounts[index]} onChange={(event) => setConsequenceAmounts((current) => updatePair(current, index, Number(event.target.value)))} required className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                          </label>
                        </div>
                      )}
                      {effectType === 'new_danger' && (
                        <label className="block text-sm font-bold text-stone-700">{t('Danger')}
                          <textarea value={consequenceDetails[index]} onChange={(event) => setConsequenceDetails((current) => updatePair(current, index, event.target.value))} required maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('A patrol enters the chamber from the east.')} />
                        </label>
                      )}
                      {effectType === 'add_diversion_waypoint' && (
                        <div className="space-y-3">
                          <label className="block text-sm font-bold text-stone-700">{t('Diversion title')}
                            <input value={consequenceDetails[index]} onChange={(event) => setConsequenceDetails((current) => updatePair(current, index, event.target.value))} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The Collapsed Passage')} />
                          </label>
                          <label className="block text-sm font-bold text-stone-700">{t('Hidden waypoint description')}
                            <textarea value={consequenceWaypointDescriptions[index]} onChange={(event) => setConsequenceWaypointDescriptions((current) => updatePair(current, index, event.target.value))} required maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                          </label>
                        </div>
                      )}
                    </fieldset>
                  );
                })}
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
                  {t('The selected consequence is permanent in the audit trail. Only its declared mechanical effect is applied; Draconi will not infer extra damage, threat, inventory, or condition changes.')}
                </div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={AlertTriangle}>{t('Resolve and continue')}</Button>
              </>
            )}

            {activeAction === 'fortune' && !oracleActionResult && (
              <>
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('Ask only when the answer is genuinely uncertain. A certain or more interesting answer may be decided without rolling.')}</p>
                <label className="block text-sm font-bold text-stone-700">{t('Question')}
                  <textarea value={fortuneQuestion} onChange={(event) => setFortuneQuestion(event.target.value)} required maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" placeholder={t('Is the old bridge still safe to cross?')} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">{t('Category')}
                    <select value={fortuneCategory} onChange={(event) => setFortuneCategory(event.target.value as FortuneCategory)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      {fortuneCategories.map((category) => <option key={category.value} value={category.value}>{t(category.label)}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-bold text-stone-700">{t('Likelihood')}
                    <select value={fortuneTilt} onChange={(event) => setFortuneTilt(event.target.value as FortuneTilt)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="unlikely">{t('Unlikely · 2d6 keep low')}</option>
                      <option value="even">{t('Even · 1d6')}</option>
                      <option value="likely">{t('Likely · 2d6 keep high')}</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Context')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={fortuneContext} onChange={(event) => setFortuneContext(event.target.value)} maxLength={5000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Relevant facts from the current scene')} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!fortuneQuestion.trim()} icon={Dices}>{t('Ask Fortune')}</Button>
              </>
            )}

            {activeAction === 'inspiration' && !oracleActionResult && (
              <>
                <p className="text-sm text-stone-600">{t('Choose one or more independent prompt columns. The generated phrase is inspiration, not an authoritative story fact until you apply it.')}</p>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Columns')}</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {inspirationColumns.map((column) => (
                      <label key={column.value} className={`cursor-pointer rounded-lg border p-3 text-center text-sm font-semibold ${selectedColumns.includes(column.value) ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-stone-200 text-stone-600'}`}>
                        <input type="checkbox" className="sr-only" checked={selectedColumns.includes(column.value)} onChange={(event) => setSelectedColumns((current) => event.target.checked ? [...current, column.value] : current.filter((value) => value !== column.value))} />
                        {t(column.label)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-bold text-stone-700">{t('Context')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={inspirationContext} onChange={(event) => setInspirationContext(event.target.value)} maxLength={5000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('What are you trying to discover or create?')} />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">{t('This uses the installed versioned Solo inspiration table.')}</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={selectedColumns.length === 0} icon={Wand2}>{t('Draw Inspiration')}</Button>
              </>
            )}

            {activeAction === 'treasure' && treasureActionResult ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <div className="text-lg font-extrabold">{treasureActionResult.summary}</div>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
                    {treasureCards.map((card, index) => <li key={index}><strong>{card.title || `Card ${index + 1}`}:</strong> {card.contents}</li>)}
                  </ol>
                </div>
                <p className="text-xs text-stone-500">{t('The entered contents are saved in the adventure record. No inventory item was created automatically.')}</p>
                <Button type="button" fullWidth icon={CheckCircle2} onClick={closeAction}>{t('Done')}</Button>
              </div>
            ) : activeAction === 'treasure' && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {t('Use your official physical treasure deck. Draconi does not know, generate, or reproduce its card contents.')}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Number of cards to draw')}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    disabled={Boolean(treasureSourceRollId)}
                    value={treasureCardCount}
                    onChange={(event) => {
                      const count = Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1)));
                      setTreasureCardCount(count);
                      setTreasureCards((current) => Array.from({ length: count }, (_, index) => current[index] || { title: '', contents: '' }));
                      setTreasureShuffled(false);
                      setTreasureReturnedShuffled(false);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal"
                  />
                  {treasureSourceRollId && <span className="mt-1 block text-xs font-normal text-amber-700">{t('This draw will resolve the treasure awarded by the linked Search or Scavenge result.')}</span>}
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                  <input type="checkbox" checked={treasureShuffled} onChange={(event) => setTreasureShuffled(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                  <span className="font-bold">{t(treasureCardCount === 1 ? 'I shuffled, then physically drew {count} card' : 'I shuffled, then physically drew {count} cards', { count: treasureCardCount })}<span className="mt-0.5 block text-xs font-normal text-stone-500">{t('Keep duplicate cards if they occur.')}</span></span>
                </label>
                <div className="space-y-3">
                  {treasureCards.map((card, index) => (
                    <fieldset key={index} className="rounded-xl border border-stone-200 p-3">
                      <legend className="px-1 text-sm font-bold text-stone-800">{t('Card {index}', { index: index + 1 })}</legend>
                      <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">{t('Name')}<span className="font-normal normal-case">{t('optional')}</span>
                        <input value={card.title} onChange={(event) => setTreasureCards((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, title: event.target.value } : entry))} maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
                      </label>
                      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-stone-500">{t('Contents')}
                        <textarea value={card.contents} onChange={(event) => setTreasureCards((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, contents: event.target.value } : entry))} required maxLength={5000} rows={3} placeholder={t('Enter the card contents or your concise record of them')} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
                      </label>
                    </fieldset>
                  ))}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Adventure notes')}<span className="font-normal text-stone-400">{t('optional')}</span>
                  <textarea value={treasureNotes} onChange={(event) => setTreasureNotes(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Where it was found or how it enters the story')} />
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                  <input type="checkbox" checked={treasureReturnedShuffled} onChange={(event) => setTreasureReturnedShuffled(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                  <span className="font-bold">{t('I returned every drawn card and shuffled the deck again')}</span>
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!treasureShuffled || !treasureReturnedShuffled || treasureCards.some((card) => !card.contents.trim())} icon={PackageSearch}>{t('Save treasure draw')}</Button>
              </>
            )}

            {activeAction === 'npc-create' && (
              <>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
                  {t('Minions use attributes 10, HP 12 and skills 12/6. Bosses use attributes 14, HP 20, armor 4 and skills 15/8. Simple magic attackers ignore WP.')}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Name')}
                  <input value={npcName} onChange={(event) => setNpcName(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Ashfang Captain')} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">{t('Template')}
                    <select value={npcTemplate} onChange={(event) => setNpcTemplate(event.target.value as typeof npcTemplate)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="minion">{t('Minion')}</option><option value="boss">{t('Boss')}</option>
                    </select>
                  </label>
                  <fieldset>
                    <legend className="text-sm font-bold text-stone-700">{t('Roles · choose up to two')}</legend>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      {(['melee', 'ranged', 'sneaky', 'magic'] as const).map((role) => (
                        <label key={role} className={`rounded border px-2 py-1.5 text-xs font-semibold ${npcRoles.includes(role) ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-stone-200 text-stone-600'}`}>
                          <input
                            type="checkbox"
                            checked={npcRoles.includes(role)}
                            disabled={!npcRoles.includes(role) && npcRoles.length >= 2}
                            onChange={(event) => setNpcRoles((current) => event.target.checked ? [...current, role] : current.filter((value) => value !== role))}
                            className="mr-1.5"
                          />{tc(role)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Description or notes')}<span className="font-normal text-stone-400">{t('optional')}</span>
                  <textarea value={npcNotes} onChange={(event) => setNpcNotes(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!npcName.trim() || npcRoles.length < 1} icon={Ghost}>{t('Create {value}', { value: tc(npcTemplate) })}</Button>
              </>
            )}

            {activeAction === 'npc-behavior' && npcActionResult ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
                  <div className="text-lg font-extrabold">{npcActionResult.summary}</div>
                  <div className="mt-2 text-sm">{journalValue(npcActionResult.state_excerpt.resolution)}</div>
                </div>
                <p className="text-xs text-stone-500">{t('The result is recorded. Apply any required attack roll, defense, damage, fear, or condition through the encounter controls.')}</p>
                <Button type="button" fullWidth onClick={closeAction}>{t('Done')}</Button>
              </div>
            ) : activeAction === 'npc-behavior' && (
              <>
                <label className="block text-sm font-bold text-stone-700">{t('NPC')}
                  <select
                    value={selectedNpcId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setSelectedNpcId(id);
                      const npc = state.npcs.find((candidate) => candidate.id === id);
                      if (npc?.roles[0]) setNpcBehaviorRole(npc.roles[0]);
                    }}
                    required
                    className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal"
                  >
                    <option value="">{t('Choose an active NPC…')}</option>
                    {state.npcs.filter((npc) => npc.status === 'active').map((npc) => <option key={npc.id} value={npc.id}>{npc.name} · {tc(npc.template)}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Behavior')}
                  <select value={npcBehavior} onChange={(event) => setNpcBehavior(event.target.value as typeof npcBehavior)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="attack">{t('Attack action · role D6 table')}</option>
                    <option value="intent">{t('Uncertain intent')}</option>
                    <option value="morale">{t('Possible flight or surrender')}</option>
                  </select>
                </label>
                {npcBehavior === 'attack' && selectedNpc && (
                  <label className="block text-sm font-bold text-stone-700">{t('Attacker role')}
                    <select value={npcBehaviorRole} onChange={(event) => setNpcBehaviorRole(event.target.value as typeof npcBehaviorRole)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      {selectedNpc.roles.map((role) => <option key={role} value={role}>{tc(role)}</option>)}
                    </select>
                  </label>
                )}
                {npcBehavior === 'intent' && (
                  <label className="block text-sm font-bold text-stone-700">{t('Oracle')}
                    <select value={npcOracle} onChange={(event) => setNpcOracle(event.target.value as typeof npcOracle)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="fortune">{t('Fortune · reaction')}</option><option value="inspiration">{t('Inspiration · Action + Thing')}</option>
                    </select>
                  </label>
                )}
                {npcBehavior === 'morale' && (
                  <label className="block text-sm font-bold text-stone-700">{t('Possible outcome')}
                    <select value={npcDisposition} onChange={(event) => setNpcDisposition(event.target.value as typeof npcDisposition)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="fled">{t('Flee')}</option><option value="surrendered">{t('Surrender')}</option>
                    </select>
                  </label>
                )}
                {npcBehavior !== 'attack' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-stone-700">{t('Likelihood')}
                      <select value={npcTilt} onChange={(event) => setNpcTilt(event.target.value as FortuneTilt)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                        <option value="unlikely">{t('Unlikely')}</option><option value="even">{t('Even')}</option><option value="likely">{t('Likely')}</option>
                      </select>
                    </label>
                  </div>
                )}
                <label className="block text-sm font-bold text-stone-700">{t('Question or context')}<span className="font-normal text-stone-400">{t('optional')}</span>
                  <textarea value={npcQuestion} onChange={(event) => setNpcQuestion(event.target.value)} maxLength={1000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                </label>
                {state.activeCombat && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{t('This resolves against the active encounter and is allowed only when the selected NPC is the active combatant.')}</p>}
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!selectedNpc || (npcBehavior === 'attack' && !npcBehaviorRole)} icon={Dices}>{t('Resolve behavior')}</Button>
              </>
            )}

            {activeAction === 'start-mission' && (
              <>
                <label className="block text-sm font-bold text-stone-700">{t('Mission title')}
                  <input value={missionTitle} onChange={(event) => setMissionTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The Vanished Lantern')} />
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Objective')}
                  <textarea value={missionObjective} onChange={(event) => setMissionObjective(event.target.value)} required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Find the missing lantern before the ruins flood.')} />
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Unknown waypoints')}
                  <input type="number" min={0} max={10} value={unknownWaypointCount} onChange={(event) => setUnknownWaypointCount(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                  <span className="mt-1 block text-xs font-normal text-stone-500">{t('Unknown waypoints remain hidden until reached. Opening, planned, unknown, and objective waypoints may total at most 12.')}</span>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Planned foreseen waypoints')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={foreseenWaypointsText} onChange={(event) => setForeseenWaypointsText(event.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={'Ruined Bridge :: The only crossing over the chasm\nSealed Gate :: A runed door guards the lower vault'} />
                  <span className="mt-1 block text-xs font-normal text-stone-500">{t('One per line: Title :: Description')}</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">{t('Opening waypoint')}
                    <input value={openingTitle} onChange={(event) => setOpeningTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                  </label>
                  <label className="block text-sm font-bold text-stone-700">{t('Threat')}
                    <input value={threatDescription} onChange={(event) => setThreatDescription(event.target.value)} required maxLength={2000} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The water keeps rising')} />
                  </label>
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Opening description')}
                  <textarea value={openingDescription} onChange={(event) => setOpeningDescription(event.target.value)} required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Describe where the hero begins.')} />
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Threat trigger effect')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={threatEffect} onChange={(event) => setThreatEffect(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('What happens when the counter reaches 6?')} />
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                  <input type="checkbox" checked={threatRecurring} onChange={(event) => setThreatRecurring(event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-indigo-600" /> {t('Recurring threat (reset to 1 after its event is resolved)')}
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!missionTitle.trim() || !missionObjective.trim() || !openingTitle.trim() || !openingDescription.trim() || !threatDescription.trim() || unknownWaypointCount < 0 || unknownWaypointCount + foreseenWaypointsText.split('\n').filter((line) => line.trim()).length + 2 > 12} icon={Flag}>{t('Start Mission')}</Button>
              </>
            )}

            {activeAction === 'reveal-waypoint' && nextWaypoint && (
              <>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">{t('Leaving {place} for waypoint {number}.', { place: state.currentWaypoint?.title || t('the current waypoint'), number: nextWaypoint.position + 1 })}</div>
                {nextWaypoint.kind === 'unknown' ? (
                  <>
                    <p className="text-sm text-stone-600">{t('This waypoint was deliberately hidden. Describe it only now that the hero reaches it.')}</p>
                    <label className="block text-sm font-bold text-stone-700">{t('Waypoint title')}
                      <input value={revealTitle} onChange={(event) => setRevealTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The Flooded Gallery')} />
                    </label>
                    <label className="block text-sm font-bold text-stone-700">{t('What is revealed?')}
                      <textarea value={revealDescription} onChange={(event) => setRevealDescription(event.target.value)} required maxLength={2000} rows={4} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Describe only the facts now visible to the hero.')} />
                    </label>
                  </>
                ) : (
                  <div className="rounded-lg bg-violet-50 p-4 text-violet-900"><div className="font-bold">{nextWaypoint.title}</div><p className="mt-1 text-sm">{nextWaypoint.description}</p></div>
                )}
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={nextWaypoint.kind === 'unknown' && (!revealTitle.trim() || !revealDescription.trim())} icon={ChevronRight}>{t('Resolve and Continue')}</Button>
              </>
            )}

            {activeAction === 'search' && state.currentWaypoint && !explorationActionResult && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {state.activeThreat
                    ? t('A thorough Search always consumes one stretch and advances {threat} by 1.', { threat: state.activeThreat.description })
                    : t('A thorough Search always consumes one stretch. No threat advances until a replacement is set.')}
                </div>
                <p className="text-sm text-stone-600">{t('The server rolls Spot Hidden and records every die. A Dragon produces two possible finds; choose the one that best fits the fiction.')}</p>
                <label htmlFor="solo-known-search-location" className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                  <input id="solo-known-search-location" type="checkbox" checked={knownSearchLocation} onChange={(event) => { setKnownSearchLocation(event.target.checked); if (!event.target.checked) setKnownSearchNature(false); }} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                  <span className="font-bold">{t('Specific known hiding place')}<span className="mt-0.5 block text-xs font-normal text-stone-500">{t('Skip Spot Hidden because the hero already knows exactly where to look.')}</span></span>
                </label>
                {knownSearchLocation && (
                  <label htmlFor="solo-known-search-nature" className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                    <input id="solo-known-search-nature" type="checkbox" checked={knownSearchNature} onChange={(event) => setKnownSearchNature(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                    <span className="font-bold">{t('Nature of the hidden item is known')}<span className="mt-0.5 block text-xs font-normal text-stone-500">{t('Skip the Search table as well; the known item is simply found.')}</span></span>
                  </label>
                )}
                <label className="block text-sm font-bold text-stone-700">{t('What is being searched?')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={searchContext} onChange={(event) => setSearchContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The carved desk and the loose stones behind it')} />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">{t('The server uses the Solo v1.2 Search table. Traps, secret paths, location details, and treasure are returned as explicit follow-ups; no effect is applied silently.')}</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={Search}>{t('Search · spend 1 stretch')}</Button>
              </>
            )}

            {activeAction === 'scavenge' && state.currentWaypoint && !explorationActionResult && (
              <>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                  {state.currentWaypoint.exploration.scavengeCount === 0
                    ? t('This is the first quick pass at this waypoint. It takes only a few minutes and does not advance the threat unless you choose a full stretch.')
                    : `This waypoint has already been scavenged ${state.currentWaypoint.exploration.scavengeCount} time(s). Another attempt automatically consumes one stretch and advances the threat by 1.`}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('What is being scavenged?')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={scavengeContext} onChange={(event) => setScavengeContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Search the abandoned camp for anything useful')} />
                </label>
                {state.currentWaypoint.exploration.scavengeCount === 0 && (
                  <label htmlFor="solo-scavenge-stretch" className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                    <input id="solo-scavenge-stretch" type="checkbox" checked={scavengeStretch} onChange={(event) => setScavengeStretch(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                    <span className="font-bold">{t('Take a full stretch')}<span className="mt-0.5 block text-xs font-normal text-stone-500">{t('Advances the active threat by 1. Choose this when the fiction makes the scavenging prolonged.')}</span></span>
                  </label>
                )}
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">{t('The server records the Solo v1.2 D10 result and any required D4/D6 subroll. No item is silently added to inventory.')}</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={PackageSearch}>
                  {t(state.currentWaypoint.exploration.scavengeCount > 0 || scavengeStretch ? 'Scavenge · spend 1 stretch' : 'Scavenge · quick pass')}
                </Button>
              </>
            )}

            {activeAction === 'rest' && hero && (
              <>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Rest type')}</legend>
                  <div className="mt-2 grid gap-2">
                    {([
                      { type: 'round' as const, title: t('Round rest · 10 seconds'), detail: t('Recover D6 WP. Once per shift.'), available: state.restState.available.round },
                      { type: 'stretch' as const, title: t('Stretch rest · 15 minutes'), detail: t('Recover D6 HP and D6 WP, and clear one chosen standard condition. Once per shift.'), available: state.restState.available.stretch },
                      { type: 'shift' as const, title: t('Shift rest · 6 hours'), detail: t('Requires safety. Fully restore HP/WP, clear standard conditions, and advance temporary injury recovery by one shift.'), available: true },
                    ]).map((option) => (
                      <label key={option.type} htmlFor={`solo-rest-${option.type}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${restType === option.type ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'} ${option.available ? '' : 'cursor-not-allowed opacity-50'}`}>
                        <input id={`solo-rest-${option.type}`} type="radio" name="solo-rest-type" value={option.type} checked={restType === option.type} disabled={!option.available} onChange={() => { setRestType(option.type); setRestUseHealing(false); setRestCondition(''); setRestSafeLocation(false); }} className="mt-1 h-4 w-4 border-stone-300 text-indigo-600" />
                        <span className="sr-only">{t('Rest type option')}</span>
                        <span className="text-sm"><strong className="block text-stone-800">{option.title}</strong><span className="text-stone-500">{option.detail}{option.available ? '' : ` ${t('Already used this shift.')}`}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {restType === 'stretch' && (
                  <>
                    <label className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                      <input type="checkbox" checked={restUseHealing} onChange={(event) => setRestUseHealing(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                      <span className="font-bold">{t('Make a solo Healing test')}<span className="mt-0.5 block text-xs font-normal text-stone-500">{t('On success, recover 2D6 HP instead of D6. A failed test keeps the normal D6 recovery.')}</span></span>
                    </label>
                    {standardConditions.length > 0 && (
                      <label className="block text-sm font-bold text-stone-700">{t('Condition to clear')}
                        <select value={restCondition} onChange={(event) => setRestCondition(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                          <option value="">{t('Choose an active condition…')}</option>
                          {standardConditions.map((condition) => <option key={condition.key} value={condition.key}>{tc(condition.name)}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}

                {restType === 'shift' && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <input type="checkbox" checked={restSafeLocation} onChange={(event) => setRestSafeLocation(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-indigo-600" />
                    <span className="font-bold">{t('I confirm this is a safe location')}<span className="mt-0.5 block text-xs font-normal">{t('The app will not infer safety from the scene.')}</span></span>
                  </label>
                )}

                {restType !== 'round' && state.activeMission && state.activeThreat?.status === 'active' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    {t('This rest advances {threat} from {counter}/6 by 1.', { threat: state.activeThreat.description, counter: state.activeThreat.counter })}
                  </div>
                )}
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">{t('Only standard conditions are cleared. Poison, fear effects, and custom statuses remain active and must be resolved separately.')}</div>
                <label className="block text-sm font-bold text-stone-700">{t('Narrative context')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={restContext} onChange={(event) => setRestContext(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Where and how does the hero rest?')} />
                </label>
                <Button
                  type="submit"
                  fullWidth
                  loading={actionMutation.isPending}
                  disabled={(restType === 'round' && !state.restState.available.round)
                    || (restType === 'stretch' && (!state.restState.available.stretch || (standardConditions.length > 0 && !restCondition)))
                    || (restType === 'shift' && !restSafeLocation)}
                  icon={Bed}
                >
                  {t('Take {value} Rest', { value: tc(restType) })}
                </Button>
              </>
            )}

            {activeAction === 'dying' && hero && (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                  <div className="font-bold">{t('{name} is at 0 HP', { name: hero.name })}</div>
                  <div className="mt-1">{t('Death rolls: {passed}/3 successes · {failed}/3 failures', { passed: hero.deathRolls.passed, failed: hero.deathRolls.failed })}{hero.isRallied ? ` · ${t('currently rallied')}` : ''}</div>
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">{t('Choose the action')}</legend>
                  <div className="mt-2 grid gap-2">
                    {([
                      { action: 'death_roll' as const, title: t('Death roll · CON {value}', { value: hero.attributes?.CON ?? '—' }), detail: t('Success adds one success; Dragon adds two. Failure adds one failure; Demon adds two.'), disabled: hero.deathRolls.passed >= 3 },
                      { action: 'self_rally' as const, title: t('Self-rally · Persuasion {value}', { value: hero.skills?.Persuasion ?? '—' }), detail: t('Solo exception: roll without a bane. Success lets the hero act at 0 HP.'), disabled: hero.isRallied || hero.deathRolls.passed >= 3 },
                      { action: 'life_saving_healing' as const, title: t('Save your life · Healing {value}', { value: hero.skills?.Healing ?? '—' }), detail: t('On success, recover D6 HP and roll a severe injury.'), disabled: hero.deathRolls.passed >= 3 },
                      { action: 'recover_stabilized' as const, title: t('Recover after three successes'), detail: t('Recover D6 HP and roll a severe injury. Available only for persisted legacy stabilized state.'), disabled: hero.deathRolls.passed < 3 },
                    ]).map((option) => (
                      <label key={option.action} htmlFor={`solo-dying-${option.action}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${dyingAction === option.action ? 'border-red-400 bg-red-50' : 'border-stone-200'} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                        <input id={`solo-dying-${option.action}`} type="radio" name="solo-dying-action" checked={dyingAction === option.action} disabled={option.disabled} onChange={() => setDyingAction(option.action)} className="mt-1 h-4 w-4 border-stone-300 text-red-600" />
                        <span className="sr-only">{t('Dying action option')}</span>
                        <span className="text-sm"><strong className="block text-stone-800">{option.title}</strong><span className="text-stone-500">{option.detail}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-bold text-stone-700">{t('What happens in the fiction?')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={dyingContext} onChange={(event) => setDyingContext(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The hero grips the altar and refuses to fall…')} />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">{t('The server decides the mechanical result. Recovery automatically creates a persisted severe injury and its healing time.')}</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={ShieldQuestion}>{t('Resolve {value}', { value: tc(dyingAction) })}</Button>
              </>
            )}

            {activeAction === 'damage' && hero && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {t('Apply this only after confirming that the fiction causes damage. Active combat damage belongs in the encounter action flow.')}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('Severity')}
                  <select value={damageSeverity} onChange={(event) => setDamageSeverity(event.target.value as typeof damageSeverity)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="unknown">{t('Unknown · roll D6 severity')}</option>
                    <option value="slight">{t('Slight · D6 damage')}</option>
                    <option value="moderate">{t('Moderate · 2D6 damage')}</option>
                    <option value="severe">{t('Severe · 2D10 damage')}</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Cause and context')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={damageContext} onChange={(event) => setDamageContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The collapsing ceiling catches the hero beneath falling stone.')} />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">{t('The server records the severity die (when unknown), every damage die, HP before/after, and any transition to dying or death.')}</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={HeartPulse}>{t('Roll and Apply Damage')}</Button>
              </>
            )}

            {activeAction === 'injury' && selectedInjury && hero && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="font-bold">{selectedInjury.name}</div>
                  <div className="mt-1">{selectedInjury.effect}</div>
                  <div className="mt-2 text-xs font-semibold">
                    {selectedInjury.permanent
                      ? t('Permanent injury')
                      : injuryRecoveryLabel(selectedInjury.remainingHealingShifts, t)}
                  </div>
                </div>
                {injuryAction === 'medical_care' ? (
                  <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                    {t('Roll Healing {Healing}. Success halves the remaining recovery time. A failed attempt can be tried again after completing the next shift rest.', { Healing: hero.skills?.Healing ?? '—' })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {t('This is a manual GM override. It immediately removes the injury from the active list, including permanent injuries, and records the correction in campaign history.')}
                  </div>
                )}
                <label className="block text-sm font-bold text-stone-700">
                  {t(injuryAction === 'medical_care' ? 'How is the injury treated?' : 'Why is this injury resolved?')} <span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={injuryContext} onChange={(event) => setInjuryContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t(injuryAction === 'medical_care' ? 'The hero cleans the wound and binds it carefully…' : 'The injury was already healed during downtime…')} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={HeartPulse} variant={injuryAction === 'mark_healed' ? 'danger' : 'primary'}>
                  {t(injuryAction === 'medical_care' ? 'Roll Healing and Apply Care' : 'Confirm and Mark Healed')}
                </Button>
              </>
            )}

            {activeAction === 'advance-threat' && state.activeThreat && (
              <>
                <div className="rounded-lg bg-amber-50 p-4 text-amber-950"><div className="font-bold">{state.activeThreat.description}</div><p className="mt-1 text-sm">{t('Current {counter}/6 · advancing by {threatAmount}', { counter: state.activeThreat.counter, threatAmount })}</p></div>
                <label className="block text-sm font-bold text-stone-700">{t('Why does the threat advance?')}
                  <textarea value={threatReason} onChange={(event) => setThreatReason(event.target.value)} required maxLength={500} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('The hero spent a stretch searching the chamber.')} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!threatReason.trim()} icon={AlertTriangle}>{t('Advance Threat +{threatAmount}', { threatAmount })}</Button>
              </>
            )}

            {activeAction === 'resolve-threat' && state.activeThreat?.status === 'triggered' && (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
                  <div className="font-bold">{state.activeThreat.description}</div>
                  {state.activeThreat.triggerEffect && <p className="mt-1 text-sm">{journalValue(state.activeThreat.triggerEffect)}</p>}
                </div>
                <label className="block text-sm font-bold text-stone-700">{t('How was the threat event resolved?')}
                  <textarea value={threatResolution} onChange={(event) => setThreatResolution(event.target.value)} required maxLength={2000} rows={4} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!threatResolution.trim()} icon={CheckCircle2}>{t(state.activeThreat.recurring ? 'Resolve and reset to 1' : 'Resolve and remove threat')}</Button>
              </>
            )}

            {activeAction === 'set-threat' && state.activeMission && (
              <>
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('A delve should retain an active threat. The replacement begins at 1.')}</p>
                <label className="block text-sm font-bold text-stone-700">{t('Threat')}
                  <textarea value={replacementThreatDescription} onChange={(event) => setReplacementThreatDescription(event.target.value)} required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Effect at 6')}<span className="font-normal text-stone-400">{t('(optional)')}</span>
                  <textarea value={replacementThreatEffect} onChange={(event) => setReplacementThreatEffect(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-700"><input type="checkbox" checked={replacementThreatRecurring} onChange={(event) => setReplacementThreatRecurring(event.target.checked)} /> {t('Recurring inherent threat')}</label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!replacementThreatDescription.trim()} icon={AlertTriangle}>{t('Set threat at 1')}</Button>
              </>
            )}

            {activeAction === 'add-waypoints' && state.activeMission && (
              <>
                <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{t('Use this when fleeing, following a secret path, or changing route. Locations are generated now with recorded Solo table rolls but remain hidden until reached.')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">{t('Kind')}
                    <select value={addedWaypointKind} onChange={(event) => setAddedWaypointKind(event.target.value as typeof addedWaypointKind)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal"><option value="diversion">{t('Diversion')}</option><option value="unknown">{t('Unknown route')}</option></select>
                  </label>
                  <label className="block text-sm font-bold text-stone-700">{t('Count')}
                    <input type="number" min={1} max={6} value={addedWaypointCount} onChange={(event) => setAddedWaypointCount(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                  </label>
                </div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={addedWaypointCount < 1 || addedWaypointCount > 6} icon={Route}>{t('Generate hidden waypoints')}</Button>
              </>
            )}

            {activeAction === 'return' && state.activeMission && (
              <>
                <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{t('Choose the route that matches the fiction after the objective is reached.')}</p>
                <label className="block text-sm font-bold text-stone-700">{t('Return route')}
                  <select value={returnRouteType} onChange={(event) => setReturnRouteType(event.target.value as typeof returnRouteType)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="cleared">{t('Cleared route · no incident')}</option>
                    <option value="dangerous">{t('Dangerous route · Awareness or Sneaking')}</option>
                    <option value="alternative">{t('Direct return impossible · D4+2 waypoints')}</option>
                  </select>
                </label>
                {returnRouteType === 'dangerous' && (
                  <label className="block text-sm font-bold text-stone-700">{t('Skill')}
                    <select value={returnCheckSkill} onChange={(event) => setReturnCheckSkill(event.target.value as typeof returnCheckSkill)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal"><option value="Awareness">{t('Awareness')}</option><option value="Sneaking">{t('Sneaking')}</option></select>
                  </label>
                )}
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={Route}>{t('Begin return journey')}</Button>
              </>
            )}

            {activeAction === 'complete-mission' && state.activeMission && (
              <>
                {!canCompleteSuccessfully && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('Success becomes available at the final objective waypoint. You may record failure or abandonment now.')}</div>
                )}
                <label className="block text-sm font-bold text-stone-700">{t('Outcome')}
                  <select value={missionOutcome} onChange={(event) => setMissionOutcome(event.target.value as typeof missionOutcome)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="success" disabled={!canCompleteSuccessfully}>{t('Success')}</option>
                    <option value="failure">{t('Failure')}</option>
                    <option value="abandoned">{t('Abandoned')}</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Mission summary')}
                  <textarea value={missionSummary} onChange={(event) => setMissionSummary(event.target.value)} required maxLength={10000} rows={5} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Record what happened and what remains unresolved.')} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!missionSummary.trim() || (missionOutcome === 'success' && !canCompleteSuccessfully)} icon={Flag}>{t('Conclude Mission')}</Button>
              </>
            )}
          </form>
        </ActionModal>
      )}
    </div>
    </ScreenLanguageProvider>
  );
}
