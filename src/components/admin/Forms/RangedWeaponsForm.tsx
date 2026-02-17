import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type RangedWeaponsFormProps = ItemFormProps;

export function RangedWeaponsForm({ entry, onChange }: RangedWeaponsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'RANGED WEAPONS'
      }}
      onChange={onChange}
    />
  );
}
