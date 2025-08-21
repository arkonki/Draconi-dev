import React from 'react';
import ItemForm from './ItemForm';


interface MeansOfTravelFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
