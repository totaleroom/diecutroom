import { DisplayUnit } from '../types';

export function fromMm(mm: number, unit: DisplayUnit): number {
  if (unit === 'cm') return mm / 10;
  if (unit === 'in') return mm / 25.4;
  return mm;
}

export function toMm(value: number, unit: DisplayUnit): number {
  if (unit === 'cm') return value * 10;
  if (unit === 'in') return value * 25.4;
  return value;
}

export function formatValue(mm: number, unit: DisplayUnit): string {
  const converted = fromMm(mm, unit);
  if (unit === 'mm') return `${Math.round(converted * 10) / 10}`;
  if (unit === 'cm') return converted.toFixed(2).replace(/\.?0+$/, '');
  return converted.toFixed(2).replace(/\.?0+$/, '');
}

export function formatDimWithUnit(mm: number, unit: DisplayUnit): string {
  return `${formatValue(mm, unit)} ${unit}`;
}

export function computeGS1CheckDigit(digits13: string): string {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = parseInt(digits13[i], 10);
    // From right to left, position 1 (index 12) has weight 3, alternating 3 and 1
    const weight = (12 - i) % 2 === 0 ? 3 : 1;
    sum += digit * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

export interface ITF14Validation {
  isValidITF14: boolean;
  isNumeric: boolean;
  length: number;
  expectedCheckDigit?: string;
  actualCheckDigit?: string;
  reason?: string;
}

export function validateITF14(value: string): ITF14Validation {
  const trimmed = value.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  if (!isNumeric) {
    return {
      isValidITF14: false,
      isNumeric: false,
      length: trimmed.length,
      reason: 'Digits only (0–9). Falling back to CODE128.',
    };
  }
  if (trimmed.length !== 14) {
    return {
      isValidITF14: false,
      isNumeric: true,
      length: trimmed.length,
      reason: `Requires 14 digits (currently ${trimmed.length}). Falling back to CODE128.`,
    };
  }
  const expected = computeGS1CheckDigit(trimmed.slice(0, 13));
  const actual = trimmed[13];
  if (expected !== actual) {
    return {
      isValidITF14: false,
      isNumeric: true,
      length: 14,
      expectedCheckDigit: expected,
      actualCheckDigit: actual,
      reason: `Invalid GS1 check digit (${actual}, expected ${expected}).`,
    };
  }
  return {
    isValidITF14: true,
    isNumeric: true,
    length: 14,
    expectedCheckDigit: expected,
    actualCheckDigit: actual,
  };
}

export function fixITF14CheckDigit(value: string): string {
  const digits = value.replace(/\D/g, '').padEnd(13, '0').slice(0, 13);
  return digits + computeGS1CheckDigit(digits);
}
