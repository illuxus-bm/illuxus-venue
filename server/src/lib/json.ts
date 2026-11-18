/** JSON.stringify replacer: BigInt → number (minor units fit in 2^53). */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  return value;
}
