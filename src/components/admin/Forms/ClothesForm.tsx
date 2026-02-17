import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';

type ClothesFormProps = ItemFormProps;

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
