import React from 'react';
import { ItemForm, type ItemFormProps } from './ItemForm';


type TradeGoodsFormProps = ItemFormProps;

export function TradeGoodsForm({ entry, onChange }: TradeGoodsFormProps) {
  return (
    <ItemForm
      entry={{
        ...entry,
        category: 'TRADE GOODS'
      }}
      onChange={onChange}
    />
  );
}
