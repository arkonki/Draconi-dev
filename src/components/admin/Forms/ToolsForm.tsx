import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type ToolsFormProps = ItemFormProps;

export function ToolsForm({ entry, onChange }: ToolsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'TOOLS'
      }}
      onChange={onChange}
    />
  );
}
