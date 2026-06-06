// Deterministic gradient placeholders — same id always yields the same pretty
// pink/pastel gradient, so the mock library looks stable across reloads.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** A CSS linear-gradient string derived from a seed (usually the nail id). */
export function gradientFor(seed: string): string {
  const h = hashString(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 35 + (h % 40)) % 360;
  const angle = h % 180;
  // Keep things soft and feminine: high lightness, moderate saturation.
  const c1 = `hsl(${hue1} 70% 82%)`;
  const c2 = `hsl(${hue2} 65% 70%)`;
  return `linear-gradient(${angle}deg, ${c1}, ${c2})`;
}
