// Convert a user-entered decimal string (e.g. "0.1") into integer base units
// without going through floating point, which can produce values like
// 100000000.00000001 lamports.
export function parseUnits(input: string, decimals: number): bigint {
  const s = input.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') {
    throw new Error('Invalid amount.');
  }
  const [whole = '', frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals}).`);
  }
  const units = BigInt((whole || '0') + frac.padEnd(decimals, '0'));
  if (units <= 0n) throw new Error('Amount must be greater than 0.');
  return units;
}

export function formatUnits(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}
