import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';

type AnimalsFormProps = ItemFormProps;

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
