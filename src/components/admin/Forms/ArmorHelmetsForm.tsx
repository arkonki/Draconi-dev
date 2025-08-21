import React from 'react';
import ItemForm from './ItemForm';

interface ArmorHelmetsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
