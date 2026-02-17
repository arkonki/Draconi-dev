import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';

type HuntingFishingFormProps = ItemFormProps;

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
