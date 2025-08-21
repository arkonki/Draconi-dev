import React from 'react';
import ItemForm from './ItemForm';


interface MeleeWeaponsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
