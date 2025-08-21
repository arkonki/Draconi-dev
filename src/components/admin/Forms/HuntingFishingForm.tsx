import React from 'react';
import ItemForm from './ItemForm';

interface HuntingFishingFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export function HuntingFishingForm({ entry, onChange }: HuntingFishingFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'HUNTING & FISHING'
      }}
      onChange={onChange}
    />
  );
}
