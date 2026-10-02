export interface SlotItem {
  id?: string;
  name: string;
  quantity?: unknown;
  weight?: unknown;
  slot?: string;
  equipped?: boolean;
  containerId?: string;
  equippedOn?: string;
  isContainer?: boolean;
  containerCapacity?: unknown;
  encumbranceModifier?: unknown;
  unknownWeight?: boolean;
  external?: boolean;
  temporarilyPlaced?: boolean;
  carriedByActorId?: string | null;
}
export interface ContainerStats {
  id: string;
  name: string;
  load: number;
  capacity: number;
  countsTowardCarriedLoad: boolean;
  storageKind: 'carried' | 'mount' | 'external';
  isOverloaded: boolean;
}
export interface SlotEncumbrance {
  baseCapacity: number;
  capacityBonuses: { id?: string; name: string; slots: number }[];
  capacity: number;
  load: number;
  isEncumbered: boolean;
  externalLoad: number;
  containerStats: Record<string, ContainerStats>;
  unknownWeightItemIds: (string | undefined)[];
  unresolvedContainerItemIds: (string | undefined)[];
  itemLocations: Record<string, 'carried' | 'external'>;
}
export function finiteNonNegative(value: unknown): number | null;
export function itemBundle(name?: string): { name: string; size: number };
export function findItemDefinition<T extends { id?: string; name?: string }>(item: string | { name?: string; originalName?: string; definitionId?: string }, definitions: T[]): T | undefined;
export function resolveItemSlots(item: string | { weight?: unknown; name?: string; originalName?: string; weightBasis?: string }, definition?: { name?: string; weight?: unknown }): { unitWeight: number; unknownWeight: boolean; bundleSize: number };
export function calculateSlotEncumbrance(input: { strength: unknown; actorId?: string; inventory?: SlotItem[]; equipped?: SlotItem[] }): SlotEncumbrance;
