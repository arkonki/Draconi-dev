import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type MusicalInstrumentsFormProps = ItemFormProps;

export function MusicalInstrumentsForm({ entry, onChange }: MusicalInstrumentsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'MUSICAL INSTRUMENTS'
      }}
      onChange={onChange}
    />
  );
}
