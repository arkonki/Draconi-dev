import React from 'react';
import ItemForm from './ItemForm';


interface LightSourcesFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
