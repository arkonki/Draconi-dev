import React from 'react';
import ItemForm from './ItemForm';


interface TradeGoodsFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

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
