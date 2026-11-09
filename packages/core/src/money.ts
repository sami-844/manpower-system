import Decimal from "decimal.js";

/** OMR amounts. Never use JavaScript numbers for money. */
export type Omr = Decimal;

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function omr(value: string): Omr {
  if (typeof value !== "string") {
    throw new Error("Money must be passed as a string (e.g. \"12.500\"), never a number");
  }
  if (!NUMERIC.test(value)) throw new Error(`Not a valid amount: "${value}"`);
  return new Money(value);
}

export type RoundingMode = "half_even" | "half_up";

/** Round to 3 decimals (baisa). Banker's rounding unless a rule says otherwise. */
export function roundBaisa(amount: Omr, mode: RoundingMode = "half_even"): Omr {
  return amount.toDecimalPlaces(3, mode === "half_up" ? Decimal.ROUND_HALF_UP : Decimal.ROUND_HALF_EVEN);
}

export function sumOmr(amounts: readonly (string | Omr)[]): Omr {
  return amounts.reduce<Omr>((acc, a) => acc.plus(typeof a === "string" ? omr(a) : a), new Money(0));
}

export function formatOmr(amount: Omr): string {
  const rounded = roundBaisa(amount);
  const [whole = "0", frac = "000"] = rounded.abs().toFixed(3).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded.isNegative() ? "-" : ""}OMR ${grouped}.${frac}`;
}
