import { createHash } from 'node:crypto';

export function stableUuid(...parts) {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function conditionId(actorId, key) {
  return stableUuid('dragonbane-condition', actorId, key);
}

export function inventoryItemId(actorId, item, index) {
  if (typeof item?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)) {
    return item.id;
  }
  return stableUuid('dragonbane-inventory', actorId, index, item?.name || '', item?.originalName || '');
}

