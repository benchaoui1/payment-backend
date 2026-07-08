/**
 * TEMPORARY internal pricing table.
 * ---------------------------------------------------------------------
 * `payment_products` does not currently store a price — only a
 * `stripe_price_id` (a Stripe Price reference). Resolving the real
 * amount from that would require the Stripe SDK, which this step is
 * explicitly not allowed to add. Changing the schema to add a price
 * column is also out of scope for this step.
 *
 * Until one of those two things happens, this file is the single
 * source of truth for `payment_orders.amount` (in cents, matching the
 * column's integer type). It mirrors the prices already shown on the
 * WorldIDP frontend today.
 *
 * TODO: replace this file's role once real pricing is available, via
 * either of:
 *   (a) resolving the amount from Stripe using each product's
 *       `stripe_price_id` (once the Stripe SDK is introduced), or
 *   (b) reading a price/amount column directly from `payment_products`
 *       (once that column is added via a migration).
 * Whichever comes first, only this file needs to change — the route
 * in create-checkout only calls `computeAmountCents()` and never
 * hardcodes a price itself.
 */

export const PRODUCT_BASE_AMOUNTS_CENTS: Record<string, number> = {
  digital_1y: 4900,
  digital_2y: 5500,
  digital_3y: 5900,
  print_1y: 7900,
  print_2y: 8900,
  print_3y: 9900,
};

export const ADDON_AMOUNTS_CENTS: Record<string, number> = {
  express_processing: 1900,
};

export const ALLOWED_ADDON_CODES = Object.keys(ADDON_AMOUNTS_CENTS);

/**
 * Returns the total order amount in cents, or null if the product_code
 * has no configured price (a server-side configuration gap, not a
 * client error — the caller should treat null as a 500, not a 400).
 */
export function computeAmountCents(productCode: string, addons: string[]): number | null {
  const base = PRODUCT_BASE_AMOUNTS_CENTS[productCode];
  if (base == null) return null;

  const addonsTotal = addons.reduce((sum, code) => sum + (ADDON_AMOUNTS_CENTS[code] ?? 0), 0);
  return base + addonsTotal;
}
