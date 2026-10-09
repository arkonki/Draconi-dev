import { useEffect, useRef, useState } from 'react';
import { Skull } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { useAuth } from '../../contexts/useAuth';
import { DEATH_ROLL_REMINDER } from '../../lib/dragonbaneReference';
import type { Character } from '../../types/character';

/** Tells a player the moment their own character drops to 0 HP, whoever caused it, and what to do next. */
export function DownedReminder({ character }: { character: Pick<Character, 'id' | 'user_id' | 'name' | 'current_hp'> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const previous = useRef<{ id: string; hp: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { id: character.id, hp: character.current_hp };
    if (before && before.id === character.id && before.hp > 0 && character.current_hp <= 0 && user?.id === character.user_id) {
      setOpen(true);
    }
  }, [character.id, character.current_hp, character.user_id, user?.id]);

  return (
    <AccessibleDialog
      isOpen={open}
      onClose={() => setOpen(false)}
      title={`${character.name} is down!`}
      description="You are at 0 hit points."
      icon={<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100"><Skull className="h-6 w-6 text-red-700" /></div>}
      size="md"
      layer="critical"
      footer={<div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(false)}>Understood</Button></div>}
    >
      <div className="space-y-3 text-sm text-stone-700">
        <p>You drop prone and cannot act, except to rally. Tell your GM if you want to try.</p>
        <p>{DEATH_ROLL_REMINDER}</p>
        <p className="text-stone-500">Your death roll tracker is on the sheet. Your GM can also record rolls for you at the table.</p>
      </div>
    </AccessibleDialog>
  );
}
