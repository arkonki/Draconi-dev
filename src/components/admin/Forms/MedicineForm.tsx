import React from 'react';
import ItemForm from './ItemForm';


interface MedicineFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export function MedicineForm({ entry, onChange }: MedicineFormFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'MEDICINE'
      }}
      onChange={onChange}
    />
  );
}
