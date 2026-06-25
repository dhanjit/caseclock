/**
 * M0.5 de-risk spike (PLAN §5 M0.5) — runs in the REAL browser.
 *
 * Proves the chosen web storage path end-to-end:
 *   in-memory SQLite → export bytes → AES-256-GCM vault (Argon2id KEK)
 *   → write ciphertext to OPFS → read back → decrypt → re-import → query matches.
 *
 * If this passes, the encrypted-storage foundation (M1) is de-risked WITHOUT a
 * custom encrypted-Wasm build and WITHOUT a cross-platform cipher-portability
 * problem. Mounted only at ?spike=1.
 */

import { useEffect, useState } from "react";
import { encryptVault, decryptVault, KDF_FLOOR, type KdfParams } from "@/crypto/envelope";
import {
  createDb,
  exportDb,
  importDb,
  saveVaultToOpfs,
  loadVaultFromOpfs,
  opfsAvailable,
} from "@/db/sqlite-blob";

type Status = "pending" | "pass" | "fail";
interface Step {
  label: string;
  status: Status;
  detail?: string;
}

const DEMO_PASS = "spike-demo-passphrase-9931";
// Floor-compliant light params keep the in-browser run snappy.
const KDF: KdfParams = { algo: "argon2id", opslimit: KDF_FLOOR.opslimit, memlimit: KDF_FLOOR.memlimit };
const VAULT_NAME = "caseclock-spike.vault";

export function SpikePanel() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [overall, setOverall] = useState<Status>("pending");

  useEffect(() => {
    let cancelled = false;
    const out: Step[] = [];
    const push = (s: Step) => {
      out.push(s);
      if (!cancelled) setSteps([...out]);
    };

    (async () => {
      try {
        if (!opfsAvailable()) {
          push({
            label: "OPFS availability",
            status: "fail",
            detail: "OPFS unavailable (e.g. Safari Private Browsing). The app handles this as a clear error state.",
          });
          if (!cancelled) setOverall("fail");
          return;
        }
        push({ label: "OPFS available", status: "pass" });

        // 1 — SQLite in wasm: create + insert
        const db = await createDb();
        db.exec("CREATE TABLE cases(id INTEGER PRIMARY KEY, fir TEXT, sections TEXT, first_remand TEXT)");
        db.exec({
          sql: "INSERT INTO cases(fir, sections, first_remand) VALUES (?,?,?)",
          bind: ["112/2025", "UAPA 16,18,20", "2025-05-01"],
        });
        const original = db.selectObjects("SELECT fir, sections, first_remand FROM cases")[0];
        push({ label: "SQLite (wasm) create + insert", status: "pass", detail: JSON.stringify(original) });

        // 2 — export → encrypt → OPFS
        const dbBytes = await exportDb(db);
        const vault = await encryptVault(DEMO_PASS, dbBytes, KDF);
        await saveVaultToOpfs(VAULT_NAME, vault);
        db.close();
        push({
          label: "Export → AES-256-GCM vault → OPFS",
          status: "pass",
          detail: `db ${dbBytes.length} B → encrypted vault ${vault.length} B written to OPFS`,
        });

        // 3 — read back → decrypt → re-import → query
        const loaded = await loadVaultFromOpfs(VAULT_NAME);
        if (!loaded) throw new Error("vault not found in OPFS after write");
        const decrypted = await decryptVault(DEMO_PASS, loaded);
        const db2 = await importDb(decrypted);
        const recovered = db2.selectObjects("SELECT fir, sections, first_remand FROM cases")[0];
        db2.close();
        const matches = JSON.stringify(recovered) === JSON.stringify(original);
        push({
          label: "OPFS → decrypt → re-import → query",
          status: matches ? "pass" : "fail",
          detail: matches ? `recovered: ${JSON.stringify(recovered)}` : "row mismatch after round-trip",
        });
        if (!matches) {
          if (!cancelled) setOverall("fail");
          return;
        }

        // 4 — wrong passphrase must fail
        let wrongRejected = false;
        try {
          await decryptVault("totally-wrong", loaded);
        } catch {
          wrongRejected = true;
        }
        push({
          label: "Wrong passphrase rejected",
          status: wrongRejected ? "pass" : "fail",
          detail: wrongRejected ? "decrypt threw as expected" : "SECURITY: wrong passphrase did not fail!",
        });

        if (!cancelled) setOverall(wrongRejected ? "pass" : "fail");
      } catch (err) {
        push({ label: "Unexpected error", status: "fail", detail: String(err) });
        if (!cancelled) setOverall("fail");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const tone =
    overall === "pass" ? "text-ok" : overall === "fail" ? "text-critical" : "text-statutory";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-lg font-semibold">M0.5 — Encrypted storage spike</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Proving the web storage path: in-memory SQLite → AES-256-GCM vault (Argon2id) → OPFS →
        decrypt → re-import. No custom encrypted-Wasm build required.
      </p>

      <div className={`mt-4 text-base font-semibold ${tone}`}>
        {overall === "pending" ? "Running…" : overall === "pass" ? "● ALL CHECKS PASSED" : "● FAILED"}
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <span
                className={
                  s.status === "pass"
                    ? "text-ok"
                    : s.status === "fail"
                      ? "text-critical"
                      : "text-statutory"
                }
              >
                {s.status === "pass" ? "✓" : s.status === "fail" ? "✗" : "…"}
              </span>
              <span className="text-sm text-ink">{s.label}</span>
            </div>
            {s.detail ? (
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink-dim">
                {s.detail}
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
