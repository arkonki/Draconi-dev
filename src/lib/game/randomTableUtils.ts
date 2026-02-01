import { RandomTable } from '../../types/randomTable';

export function rollD66(): number {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return d1 * 10 + d2;
}

export function rollDie(dieType: string): number {
    if (dieType === 'd66') return rollD66();
    const max = parseInt(dieType.substring(1));
    if (isNaN(max)) return 0;
    return Math.floor(Math.random() * max) + 1;
}

export function lookupTableResult(table: RandomTable, roll: number): string | null {
    for (const row of table.rows) {
        if (roll >= row.min && roll <= row.max) {
            return row.result;
        }
    }
    return null;
}

export function rollOnTable(table: RandomTable): { roll: number; result: string } {
    const roll = rollDie(table.die_type);
    const result = lookupTableResult(table, roll);

    if (!result) {
        // Fallback: finding closest? or just "No result"
        return { roll, result: "No matching entry." };
    }

    return { roll, result };
}
