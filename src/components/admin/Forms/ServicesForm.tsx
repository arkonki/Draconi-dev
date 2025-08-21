import React from 'react';
import ItemForm from './ItemForm';


interface ServicesFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
