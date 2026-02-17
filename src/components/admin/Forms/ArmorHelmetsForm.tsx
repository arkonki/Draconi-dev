import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';

type ArmorHelmetsFormProps = ItemFormProps;

export function ArmorHelmetsForm({ entry, onChange }: ArmorHelmetsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'ARMOR & HELMETS'
      }}
      onChange={onChange}
    />
  );
}
