export function nextRandom(seed: number): [number, number] {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let value = nextSeed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, nextSeed];
}

export function seededIndex(seed: number, length: number): [number, number] {
  const [roll, nextSeed] = nextRandom(seed);
  return [Math.floor(roll * length), nextSeed];
}

export function seededShuffle<T>(values: T[], seed: number): [T[], number] {
  const result = [...values];
  let nextSeed = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    let target: number;
    [target, nextSeed] = seededIndex(nextSeed, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return [result, nextSeed];
}

export function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}
