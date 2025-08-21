import React from 'react';
import ItemForm from './ItemForm';


interface StudiesMagicFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
