import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type StudiesMagicFormProps = ItemFormProps;

export function StudiesMagicForm({ entry, onChange }: StudiesMagicFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'STUDIES & MAGIC'
      }}
      onChange={onChange}
    />
  );
}
