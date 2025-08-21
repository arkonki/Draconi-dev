import React from 'react';
import ItemForm from './ItemForm';

interface ClothesFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export function ClothesForm({ entry, onChange }: ClothesFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'CLOTHES'
      }}
      onChange={onChange}
    />
  );
}
