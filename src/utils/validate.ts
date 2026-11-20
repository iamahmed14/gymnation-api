import { validationError } from '../errors';
import { isValidDate } from './dates';

// Small field checkers. Each one returns the typed value or throws 422 VALIDATION.

type Input = Record<string, unknown>;

export function asObject(value: unknown, what = 'Body'): Input {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw validationError(`${what} must be a JSON object`);
  }
  return value as Input;
}

export function requireString(input: Input, field: string): string {
  const value = input[field];
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  return value;
}

export function requireInt(input: Input, field: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = input[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function requireDate(input: Input, field: string): string {
  const value = requireString(input, field);
  if (!isValidDate(value)) throw validationError(`${field} must be a date in YYYY-MM-DD format`);
  return value;
}

export function requireOneOf<T extends string>(input: Input, field: string, allowed: readonly T[]): T {
  const value = input[field];
  if (!allowed.includes(value as T)) throw validationError(`${field} must be one of ${allowed.join(', ')}`);
  return value as T;
}
