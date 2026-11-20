// All money is integer minor units. Rounding is done with integer math only,
// so there is no floating-point drift (e.g. 1644.45 can't become 1644.4499…).

/** numerator / denominator, rounded half up. Inputs are non-negative integers. */
export function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function vatOf(net: number, vatPercent: number): number {
  return roundHalfUp(net * vatPercent, 100);
}
