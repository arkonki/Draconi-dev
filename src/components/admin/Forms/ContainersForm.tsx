import React from 'react';
import ItemForm from './ItemForm';

interface ContainersFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
