import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type MeleeWeaponsFormProps = ItemFormProps;

export function MeleeWeaponsForm({ entry, onChange }: MeleeWeaponsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'MELEE WEAPONS'
      }}
      onChange={onChange}
    />
  );
}
