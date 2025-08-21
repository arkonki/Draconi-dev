import React from 'react';
import ItemForm from './ItemForm';


interface ToolsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
