import React from 'react';
import ItemForm from './ItemForm';


interface RangedWeaponsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
