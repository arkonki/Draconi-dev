import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { Money } from '../../types/character';
import { copperToCurrency, currencyToCopper, formatCost } from '../../lib/equipment';
import { shopCartTotal, shopPriceInCopper, shopPurchaseContents, type ShopCartLine } from '../../lib/shopCart';
import { Button } from '../shared/Button';

interface Props {
  lines: ShopCartLine[];
  money: Money;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onConfirm: () => void;
}

const costLabel = (copper: number) => copper === 0 ? 'Free' : formatCost(copperToCurrency(copper));

export function ShopCartPanel({ lines, money, busy, error, onBack, onQuantity, onRemove, onClear, onConfirm }: Props) {
  const total = shopCartTotal(lines);
  const balance = currencyToCopper(money);
  const affordable = total !== null && balance >= total;
  return (
    <section aria-label="Shopping cart" className="flex h-full min-h-0 flex-col bg-gray-50">
      <div className="shop-cart-header flex shrink-0 items-center gap-3 border-b bg-white px-4 py-3">
        <button type="button" aria-label="Continue shopping" onClick={onBack} disabled={busy} className="flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-gray-50 disabled:opacity-50"><ArrowLeft size={18} /></button>
        <div className="flex-1"><h3 className="flex items-center gap-2 font-bold text-gray-900"><ShoppingCart size={18} /> Shopping cart</h3><p className="text-xs text-gray-500">Nothing is purchased until you confirm.</p></div>
        {lines.length > 0 && <button type="button" onClick={onClear} disabled={busy} className="min-h-10 px-2 text-xs font-medium text-red-700 disabled:opacity-50">Clear cart</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {lines.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Your cart is empty. Add items from the shop to review them here.</p> : (
          <ul className="space-y-3">
            {lines.map(({ item, quantity }) => {
              const price = shopPriceInCopper(item);
              const contents = shopPurchaseContents(item);
              return <li key={item.id} aria-label={`Cart item: ${item.name}`} className="rounded-xl border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="text-sm font-bold text-gray-800">{item.name}</h4><p className="mt-1 text-xs text-gray-500">{price === null ? 'Price unavailable' : `${costLabel(price)} per purchase`}</p><p className="mt-1 text-xs text-indigo-700">Adds {contents.quantity * quantity} × {contents.name}</p></div>
                  <button type="button" aria-label={`Remove ${item.name} from cart`} onClick={() => onRemove(item.id)} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 size={16} /></button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => onQuantity(item.id, quantity - 1)} disabled={busy || quantity <= 1} className="flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-40"><Minus size={14} /></button>
                    <input aria-label={`${item.name} purchase quantity`} type="number" min="1" max="999" step="1" value={quantity} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1) onQuantity(item.id, value); }} className="h-10 w-16 rounded-lg border text-center text-sm" />
                    <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => onQuantity(item.id, quantity + 1)} disabled={busy || quantity >= 999} className="flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-40"><Plus size={14} /></button>
                  </div>
                  <span className="text-sm font-bold text-gray-800">{price === null ? '—' : costLabel(price * quantity)}</span>
                </div>
              </li>;
            })}
          </ul>
        )}
      </div>
      <div className="shop-cart-footer shrink-0 space-y-2 border-t bg-white px-4 py-3">
        <div aria-live="polite" className="space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-gray-500">Wallet</span><span>{formatCost(money)}</span></p>
          <p className="flex justify-between font-bold"><span>Total</span><span>{total === null ? 'Price unavailable' : costLabel(total)}</span></p>
          {affordable && total !== null && <p className="flex justify-between text-xs text-gray-500"><span>After purchase</span><span>{formatCost(copperToCurrency(balance - total))}</span></p>}
          {!affordable && total !== null && <p role="status" className="text-xs text-red-700">Not enough money. You need {formatCost(copperToCurrency(total - balance))} more.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="button" className="w-full" onClick={onConfirm} disabled={busy || !lines.length || !affordable}>{busy ? 'Purchasing…' : 'Confirm purchase'}</Button>
      </div>
    </section>
  );
}
