import React from 'react';
import ItemForm from './ItemForm';

interface AnimalsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export function AnimalsForm({ entry, onChange }: AnimalsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'ANIMALS'
      }}
      onChange={onChange}
    />
  );
}
