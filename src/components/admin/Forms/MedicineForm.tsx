import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type MedicineFormProps = ItemFormProps;

export function MedicineForm({ entry, onChange }: MedicineFormProps) {
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
