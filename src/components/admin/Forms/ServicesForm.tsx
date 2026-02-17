import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type ServicesFormProps = ItemFormProps;

export function ServicesForm({ entry, onChange }: ServicesFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'SERVICES'
      }}
      onChange={onChange}
    />
  );
}
