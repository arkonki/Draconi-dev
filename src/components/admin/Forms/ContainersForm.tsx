import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';

type ContainersFormProps = ItemFormProps;

export function ContainersForm({ entry, onChange }: ContainersFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'CONTAINERS'
      }}
      onChange={onChange}
    />
  );
}
