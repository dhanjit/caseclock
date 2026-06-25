/**
 * Lock screen (PLAN §6.5) — create-vault on first run, unlock thereafter.
 * Gates the whole app: nothing decrypts until the passphrase is entered.
 */

import { useState } from "react";
import { useSession } from "@/state/session";
import { estimateStrength, MIN_PASSPHRASE_LENGTH } from "@/lib/passphrase";

function ClockGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Let React paint the "working…" state before the synchronous Argon2id blocks the thread. */
const yieldToPaint = () => new Promise((r) => setTimeout(r, 40));

export function LockScreen() {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const createVault = useSession((s) => s.createVault);
  const unlock = useSession((s) => s.unlock);

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const creating = status === "no-vault";
  const strength = estimateStrength(pw);
  const mismatch = creating && confirm.length > 0 && pw !== confirm;
  const canSubmit = creating
    ? strength.ok && pw === confirm && !busy
    : pw.length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    await yieldToPaint();
    try {
      if (creating) await createVault(pw);
      else await unlock(pw);
      setPw("");
      setConfirm("");
    } catch {
      // error surfaced via the store
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-full place-items-center text-ink-dim">Loading…</div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="mx-auto grid min-h-full max-w-md place-items-center px-6">
        <div className="rounded-2xl border border-critical/40 bg-critical/10 p-5 text-center">
          <p className="font-semibold text-critical">Storage unavailable</p>
          <p className="mt-2 text-sm text-ink-dim">
            {error ?? "Persistent storage isn't available here."} CaseClock needs persistent
            on-device storage — use Chrome or Edge in a normal (non-private) window, or the
            installed app.
          </p>
        </div>
      </div>
    );
  }

  const strengthColor = ["bg-critical", "bg-critical", "bg-statutory", "bg-court", "bg-ok"][strength.score];
  const strengthWidth = ["10%", "25%", "50%", "75%", "100%"][strength.score];

  return (
    <div className="mx-auto grid min-h-full max-w-md place-items-center px-6">
      <form onSubmit={submit} className="w-full">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-court/15 text-court">
            <ClockGlyph />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">CaseClock</h1>
            <p className="text-sm text-ink-dim">
              {creating ? "Create your encrypted vault" : "Unlock your vault"}
            </p>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-dim">Passphrase</label>
        <input
          type="password"
          autoFocus
          autoComplete={creating ? "new-password" : "current-password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink outline-none focus:border-court"
          placeholder={creating ? `At least ${MIN_PASSPHRASE_LENGTH} characters` : "Enter passphrase"}
        />

        {creating && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div className={`h-full ${strengthColor}`} style={{ width: pw ? strengthWidth : "0%" }} />
            </div>
            <p className="mt-1 text-xs text-ink-dim">
              Strength: <span className="text-ink">{pw ? strength.label : "—"}</span> · this is the
              only thing protecting your data on a lost device. Use a long, memorable phrase. It
              cannot be recovered.
            </p>

            <label className="mb-1 mt-4 block text-xs font-medium text-ink-dim">Confirm</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink outline-none focus:border-court"
              placeholder="Re-enter passphrase"
            />
            {mismatch && <p className="mt-1 text-xs text-critical">Passphrases don't match.</p>}
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 w-full rounded-xl bg-court px-4 py-2.5 font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (creating ? "Creating vault…" : "Unlocking…") : creating ? "Create vault" : "Unlock"}
        </button>

        <p className="mt-4 text-center text-xs text-soft">
          All data stays encrypted on this device. No cloud, no servers.
        </p>
      </form>
    </div>
  );
}
