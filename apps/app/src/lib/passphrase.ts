/**
 * Lightweight passphrase strength heuristic for the create-vault gate (PLAN §6.4).
 * A real zxcvbn / diceware estimator lands in M10 hardening; this is a floor so a
 * trivially weak passphrase can't protect an imaged device.
 */

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "too short" | "weak" | "fair" | "good" | "strong";
  ok: boolean;
}

export const MIN_PASSPHRASE_LENGTH = 12;

export function estimateStrength(pw: string): Strength {
  if (pw.length < MIN_PASSPHRASE_LENGTH) {
    return { score: 0, label: "too short", ok: false };
  }
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  const words = pw.trim().split(/\s+/).filter(Boolean).length;

  // Reward length and either character variety or a multi-word (diceware-style) phrase.
  let score = 1;
  if (pw.length >= 16 || words >= 3) score = 2;
  if ((pw.length >= 20 && classes >= 2) || words >= 4) score = 3;
  if ((pw.length >= 24 && classes >= 3) || words >= 5) score = 4;

  const label = (["weak", "weak", "fair", "good", "strong"] as const)[score];
  return { score: score as Strength["score"], label, ok: score >= 2 };
}
