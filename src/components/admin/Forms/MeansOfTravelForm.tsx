import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type MeansOfTravelFormProps = ItemFormProps;

export function MeansOfTravelForm({ entry, onChange }: MeansOfTravelFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'MEANS OF TRAVEL'
      }}
      onChange={onChange}
    />
  );
}
