import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type LightSourcesFormProps = ItemFormProps;

export function LightSourcesForm({ entry, onChange }: LightSourcesFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'LIGHT SOURCES'
      }}
      onChange={onChange}
    />
  );
}
