// All money is integer minor units (fils), so values never carry float drift
// (e.g. 1644.45 can't become 1644.4499…). All rounding goes through here.

/**
 * numerator / denominator, rounded half up. Inputs are non-negative integers;
 * a true .5 is exactly representable as a float, so Math.round is safe here.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  return Math.round(numerator / denominator);
}

export function vatOf(net: number, vatPercent: number): number {
  return roundHalfUp(net * vatPercent, 100);
}
