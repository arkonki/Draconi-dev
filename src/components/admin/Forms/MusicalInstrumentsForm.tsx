import React from 'react';
import ItemForm from './ItemForm';


interface MusicalInstrumentsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
