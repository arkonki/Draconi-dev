import { Shield, Swords } from 'lucide-react';
import { useT, type Translator } from '../../i18n/translate';
import type { SoloActor, SoloActorGear } from '../../lib/api/solo';

const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';

function armorPoints(gear: Array<SoloActorGear | null | undefined>): number {
  return gear.reduce((total, piece) => total + (piece && hasValue(piece.armorRating) ? Number(piece.armorRating) || 0 : 0), 0);
}

/** The numbers that matter for a piece of gear, in a few words. */
function gearFacts(piece: SoloActorGear, t: Translator): string[] {
  const facts: string[] = [];
  if (piece.damage) facts.push(t('Damage {damage}', { damage: piece.damage }));
  if (hasValue(piece.range) && String(piece.range) !== '0') facts.push(t('Range {range}', { range: String(piece.range) }));
  if (piece.grip === '1H') facts.push(t('One hand'));
  if (piece.grip === '2H') facts.push(t('Two hands'));
  if (hasValue(piece.armorRating)) facts.push(t('Armor {rating}', { rating: String(piece.armorRating) }));
  if (hasValue(piece.durability)) facts.push(t('Durability {value}', { value: String(piece.durability) }));
  return facts;
}

function GearLine({ piece }: { piece: SoloActorGear }) {
  const t = useT();
  const facts = gearFacts(piece, t);
  const features = (piece.features ?? []).map((feature) => feature.toLowerCase()).join(', ');
  return (
    <li className="text-sm text-stone-800">
      <span className="font-semibold">{piece.name}</span>
      {piece.state?.broken && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">{t('Broken')}</span>}
      {(facts.length > 0 || features) && <div className="text-xs text-stone-500">{[...facts, features].filter(Boolean).join(' · ')}</div>}
    </li>
  );
}

/**
 * What the hero has in hand and on: weapons, armor, helmet and shield, with the numbers that matter. The narrator is
 * told the same list on every turn, so what is shown here is what it describes.
 */
export function SoloGear({ hero }: { hero: SoloActor }) {
  const t = useT();
  const weapons = (hero.weapons ?? []).filter(Boolean);
  const worn = [hero.bodyArmor, hero.helmet].filter((piece): piece is SoloActorGear => Boolean(piece));
  const shield = hero.shield ?? null;
  const otherEquipped = hero.inventory.filter((item) => item.equipped);
  const lit = (hero.heldItems ?? []).filter((item) => item.state?.isLit);
  const total = armorPoints([...worn, shield]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Swords className="h-3.5 w-3.5" /> {t('Weapons')}</div>
        {weapons.length > 0 ? (
          <ul className="mt-2 space-y-2">{weapons.map((piece) => <GearLine key={piece.id} piece={piece} />)}</ul>
        ) : (
          <p className="mt-2 text-sm text-stone-400">{t('Unarmed')}</p>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
          <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> {t('Armor')}</span>
          {total > 0 && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] normal-case tracking-normal text-stone-700">{t('Total armor {rating}', { rating: total })}</span>}
        </div>
        {worn.length > 0 || shield ? (
          <ul className="mt-2 space-y-2">
            {worn.map((piece) => <GearLine key={piece.id} piece={piece} />)}
            {shield && <GearLine piece={shield} />}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-400">{t('No armor')}</p>
        )}
      </div>
      {(otherEquipped.length > 0 || lit.length > 0) && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('Other equipped')}</div>
          <div className="mt-2 space-y-1 text-sm text-stone-700">
            {otherEquipped.map((item) => <div key={item.id}>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</div>)}
            {lit.map((item) => <div key={`lit-${item.id}`}>{item.name} · {t('Lit')}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
