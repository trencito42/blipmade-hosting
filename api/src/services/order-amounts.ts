/**
 * The distribution of an order total over the lines of an order.
 *
 * A promotion belongs to the order, not to a line: the price of a line stays
 * the price of the catalogue. The amount that is really due is the order
 * total, and it is the only amount the customer was quoted.
 *
 * Before that amount can be collected it has to be split over the lines,
 * because the payment provider is given one price per unit of every line.
 * The split is deterministic and the parts always add up to exactly the order
 * total, so the provider collects what the customer was quoted and the amount
 * the platform records is the amount that was paid.
 */

/** A line of an order, as it is stored. */
export interface OrderLineAmounts {
  /** The catalogue price of one unit, in minor units. */
  unitAmount: number;
  /** How many units the line covers. */
  quantity: number;
  /** The catalogue price of the whole line, in minor units. */
  total: number;
}

/** A part of a line that can be charged with a single price. */
export interface AmountChunk {
  /** The index of the line the part belongs to. */
  lineIndex: number;
  /** How many units the part covers. */
  quantity: number;
  /** The price of one unit, in minor units. */
  unitAmount: number;
}

function lineQuantity(line: OrderLineAmounts): number {
  return Math.max(1, Math.trunc(line.quantity) || 1);
}

/**
 * Splits the order total over the lines of the order.
 *
 * Every part is priced in whole minor units and the parts add up to exactly
 * the order total, so the collected amount never differs from the quoted
 * amount by a rounding error. A line that covers several units is split into
 * at most two parts, because the provider charges every unit of a line with
 * the same price.
 */
export function allocateOrderAmounts(lines: OrderLineAmounts[], orderTotal: number): AmountChunk[] {
  if (lines.length === 0) return [];

  const target = Math.max(0, Math.round(orderTotal));
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, Math.round(line.total)), 0);
  if (subtotal <= 0) return [];

  // The total of an order never exceeds the sum of its lines: a promotion can
  // only take away. A total that is bigger is a defect, and the list price is
  // used as the ceiling instead of charging more than the catalogue.
  const chargeable = Math.min(target, subtotal);

  // The share of every line is proportional to its price. The rounding
  // remainder is left to the last line, so the sum stays exact.
  const effective: number[] = [];
  let assigned = 0;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const lineTotal = Math.max(0, Math.round(lines[index].total));
    const share = Math.floor((lineTotal * chargeable) / subtotal);
    effective.push(share);
    assigned += share;
  }
  effective.push(Math.max(0, chargeable - assigned));

  const chunks: AmountChunk[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const quantity = lineQuantity(lines[index]);
    const amount = effective[index];
    const base = Math.floor(amount / quantity);
    const remainder = amount - base * quantity;

    if (remainder === 0) {
      chunks.push({ lineIndex: index, quantity, unitAmount: base });
      continue;
    }
    // The units of a line share one price, so the remainder is charged to the
    // last units of the line with one minor unit more each.
    if (quantity - remainder > 0) {
      chunks.push({ lineIndex: index, quantity: quantity - remainder, unitAmount: base });
    }
    chunks.push({ lineIndex: index, quantity: remainder, unitAmount: base + 1 });
  }

  return chunks;
}

/**
 * The amount that is due for every line of the order.
 *
 * It is the sum of the parts of the line, so it always adds up to the order
 * total.
 */
export function allocateLineTotals(lines: OrderLineAmounts[], orderTotal: number): number[] {
  const chunks = allocateOrderAmounts(lines, orderTotal);
  const totals = lines.map(() => 0);
  for (const chunk of chunks) {
    totals[chunk.lineIndex] += chunk.quantity * chunk.unitAmount;
  }
  return totals;
}

/**
 * The price of one unit of every line, after the promotion.
 *
 * A line that covers several units is charged an average price, because the
 * units of a line share one price in the payment provider.
 */
export function allocateUnitPrices(lines: OrderLineAmounts[], orderTotal: number): number[] {
  const totals = allocateLineTotals(lines, orderTotal);
  return lines.map((line, index) => {
    const quantity = lineQuantity(line);
    return Math.round(totals[index] / quantity);
  });
}
