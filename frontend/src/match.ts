/**
 * Returns background/text colors for a match-score pill.
 *  - 100–80%: green (100 darkest → 80 lightest)
 *  - 79–60%:  yellow (79 darkest → 60 lightest)
 *  - 59–0%:   pink → dark red (59 lightest pink → 0 darkest red)
 */
export function matchStyle(score: number): {
  background: string;
  color: string;
} {
  const s = Math.max(0, Math.min(100, score));
  let hue: number;
  let sat: number;
  let light: number;

  if (s >= 80) {
    const t = (s - 80) / 20; // 0 at 80 (lightest) → 1 at 100 (darkest)
    hue = 140;
    sat = 55;
    light = 72 - t * (72 - 26);
  } else if (s >= 60) {
    const t = (s - 60) / 19; // 0 at 60 (lightest) → 1 at 79 (darkest)
    hue = 48;
    sat = 85;
    light = 82 - t * (82 - 42);
  } else {
    const t = (59 - s) / 59; // 0 at 59 (lightest pink) → 1 at 0 (darkest red)
    hue = 350;
    sat = 70;
    light = 78 - t * (78 - 32);
  }

  return {
    background: `hsl(${hue}, ${sat}%, ${light}%)`,
    color: light < 55 ? "#ffffff" : "#111827",
  };
}
