import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useSession } from "@/state/session";
import { useNav } from "@/state/nav";
import { useCases } from "@/state/cases";
import { useWatchlist } from "@/state/watchlist";
import { useNotifySettings } from "@/state/notify-settings";
import { exportBackup, prepareImport, applyImport, type BackupInfo } from "@/db/backup";
import { loadSampleData } from "@/state/seed";
import { buildAllCasesIcs } from "@/domain/ics";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { estimateStrength } from "@/lib/passphrase";
import { fmtDate } from "@/lib/format";
import { scheduleTestNotification } from "@/lib/notifications";
import { Section, Field } from "@/features/components/bits";
import { TopBar, btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

function tsToDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

export function SettingsView() {
  const client = useSession((s) => s.client);
  const go = useNav((s) => s.go);
  const reloadCases = useCases((s) => s.load);

  // Export
  const [expPass, setExpPass] = useState("");
  const [expConfirm, setExpConfirm] = useState("");
  const [expMsg, setExpMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [impPass, setImpPass] = useState("");
  const [prepared, setPrepared] = useState<{ dbBytes: Uint8Array; info: BackupInfo } | null>(null);
  const [liveSeq, setLiveSeq] = useState(0);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [impErr, setImpErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const expStrength = estimateStrength(expPass);
  // Backup files travel off-device, so demand a stronger passphrase than the device lock.
  const canExport = expStrength.score >= 3 && expPass === expConfirm && !exporting;

  const yieldPaint = () => new Promise((r) => setTimeout(r, 40));

  async function doExport() {
    if (!canExport) return;
    setExporting(true);
    setExpMsg(null);
    await yieldPaint();
    try {
      const bytes = await exportBackup(client, expPass);
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      a.href = url;
      a.download = `caseclock-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.ccbak`;
      a.click();
      // Defer revoke so it can't race the download start on some browsers (0-byte file).
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExpMsg("Backup downloaded (AES-256-GCM, your backup passphrase). Move it to offline media — Downloads may be cloud-synced (OneDrive/Drive). Never keep it on a server.");
      setExpPass("");
      setExpConfirm("");
    } catch (e) {
      setExpMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPrepared(null);
    setImpErr(null);
    setImpMsg(null);
    if (!f) return;
    setFileName(f.name);
    setFileBytes(new Uint8Array(await f.arrayBuffer()));
  }

  async function inspect() {
    if (!fileBytes || !impPass || working) return;
    setWorking(true);
    setImpErr(null);
    await yieldPaint();
    try {
      const result = await prepareImport(fileBytes, impPass);
      const rows = await client.query<{ value: string }>(
        "SELECT value FROM meta WHERE key='last_modified_seq'",
      );
      setLiveSeq(rows.length ? Number(rows[0].value) : 0);
      setPrepared(result);
    } catch (e) {
      setImpErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  async function restore() {
    if (!prepared || working) return;
    setWorking(true);
    await yieldPaint();
    try {
      await applyImport(client, prepared.dbBytes);
      await reloadCases();
      setImpMsg("Restore complete. Your cases now match the backup.");
      setPrepared(null);
      setFileBytes(null);
      setFileName("");
      setImpPass("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setImpErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-24 pt-5">
      <TopBar
        title="Settings & backup"
        subtitle="No cloud — an encrypted file is your only backup"
        actions={<button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>Back</button>}
      />

      <div className="mt-5 space-y-3">
        <Section title="Export encrypted backup">
          <p className="mb-3 text-xs text-ink-dim">
            Creates one encrypted file protected by a <strong>separate backup passphrase</strong>. Use it
            to move data to a new device or recover after loss. Transfer over USB / local file only.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Backup passphrase">
              <input type="password" className={input} value={expPass} onChange={(e) => setExpPass(e.target.value)} placeholder="Long, memorable" autoComplete="new-password" />
            </Field>
            <Field label="Confirm">
              <input type="password" className={input} value={expConfirm} onChange={(e) => setExpConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          {expPass && <p className="mt-1 text-xs text-ink-dim">Strength: <span className="text-ink">{expStrength.label}</span></p>}
          <button onClick={doExport} disabled={!canExport} className={`${btn("primary")} mt-3 disabled:opacity-40`}>
            {exporting ? "Encrypting…" : "Export backup"}
          </button>
          {expMsg && <p className="mt-2 text-xs text-ok">{expMsg}</p>}
        </Section>

        <Section title="Restore from backup">
          <p className="mb-3 text-xs text-critical">
            ⚠ Restoring <strong>replaces all current cases</strong> on this device with the backup's contents.
          </p>
          <input ref={fileRef} type="file" accept=".ccbak,application/octet-stream" onChange={onPickFile} className="block w-full text-sm text-ink-dim file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-ink" />
          {fileName && (
            <div className="mt-3 space-y-3">
              <Field label="Backup passphrase">
                <input type="password" className={input} value={impPass} onChange={(e) => setImpPass(e.target.value)} placeholder={`Passphrase for ${fileName}`} autoComplete="off" />
              </Field>
              {!prepared && (
                <button onClick={inspect} disabled={!impPass || working} className={`${btn("ghost")} disabled:opacity-40`}>
                  {working ? "Decrypting…" : "Inspect backup"}
                </button>
              )}
            </div>
          )}
          {impErr && <p className="mt-2 text-xs text-critical">{impErr}</p>}
          {prepared && (
            <div className="mt-3 rounded-xl border border-statutory/40 bg-statutory/10 p-3">
              <p className="text-sm text-ink">
                {prepared.info.caseCount} case{prepared.info.caseCount === 1 ? "" : "s"} · exported {tsToDate(prepared.info.exportedAt)} · schema v{prepared.info.schemaVersion}
              </p>
              {prepared.info.seq < liveSeq && (
                <p className="mt-1 text-xs font-medium text-critical">
                  ⚠ This backup is OLDER than your current data — restoring will lose newer changes.
                </p>
              )}
              <button onClick={restore} disabled={working} className={`${btn("primary")} mt-2 bg-critical disabled:opacity-40`}>
                {working ? "Restoring…" : "Restore (replaces all data)"}
              </button>
            </div>
          )}
          {impMsg && <p className="mt-2 text-xs text-ok">{impMsg}</p>}
        </Section>

        <CalendarExport />

        {Capacitor.isNativePlatform() && <NotificationSettings />}

        <WatchlistManager />

        <DemoData />

        <Section title="Security">
          <ul className="space-y-1.5 text-xs text-ink-dim">
            <li>• All data is encrypted on this device (AES-256-GCM, Argon2id). No cloud, no servers, no telemetry.</li>
            <li>• The vault auto-locks when you switch away from the app.</li>
            <li>• Your passphrase cannot be recovered — keep a backup file in a safe place.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function CalendarExport() {
  const aggregates = useCases((s) => s.aggregates);
  const [busy, setBusy] = useState(false);

  function doExportIcs() {
    setBusy(true);
    try {
      const ics = buildAllCasesIcs(aggregates, DEFAULT_SETTINGS, todayISO());
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      a.href = url;
      a.download = `caseclock-deadlines-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Calendar export (.ics)">
      <p className="mb-3 text-xs text-ink-dim">
        One-way snapshot of every live case's statutory deadlines, hearings and reminders
        (15-day + 1-day alerts). Import into Apple / Google / Outlook Calendar. <strong>Not a live sync</strong> —
        re-export after changes. Closed cases are excluded.
      </p>
      <button onClick={doExportIcs} disabled={busy || aggregates.length === 0} className={`${btn("primary")} disabled:opacity-40`}>
        {busy ? "Building…" : "Export deadlines (.ics)"}
      </button>
    </Section>
  );
}

function DemoData() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      await loadSampleData();
      setMsg("Loaded 2 sample cases (and the ULFA-I watchlist entry). Open the dashboard to see them.");
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Demo data">
      <p className="mb-3 text-xs text-ink-dim">
        Loads the two acceptance cases from the sample files — every panel and alert populated
        (expert-report 2-day, Process &amp; Requests, custody production, Superior Court Zone, priority pinning).
        Idempotent: re-loading just refreshes them.
      </p>
      <button onClick={load} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>
        {busy ? "Loading…" : "Load sample cases"}
      </button>
      {msg && <p className="mt-2 text-xs text-ok">{msg}</p>}
    </Section>
  );
}

function NotificationSettings() {
  const enabled = useNotifySettings((s) => s.enabled);
  const setEnabled = useNotifySettings((s) => s.setEnabled);
  const [testState, setTestState] = useState<"idle" | "scheduled" | "denied">("idle");

  async function sendTest() {
    setTestState((await scheduleTestNotification()) ? "scheduled" : "denied");
  }

  return (
    <Section title="Deadline notifications" hint="Best effort — the in-app agenda is the system of record">
      <label className="flex items-center gap-1.5 text-xs text-ink-dim">
        <input type="checkbox" checked={enabled} onChange={(e) => void setEnabled(e.target.checked)} />
        Schedule OS alarms for statutory deadlines (next 30 days)
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => void sendTest()} className={btn("ghost")}>
          Send test notification
        </button>
        {testState === "scheduled" && (
          <span className="text-xs text-ink-dim">Fires in ~2 minutes — lock the device to see it.</span>
        )}
        {testState === "denied" && (
          <span className="text-xs text-critical">Notifications are denied — enable them in iOS Settings.</span>
        )}
      </div>
    </Section>
  );
}

function WatchlistManager() {
  const names = useWatchlist((s) => s.names);
  const add = useWatchlist((s) => s.add);
  const remove = useWatchlist((s) => s.remove);
  const [val, setVal] = useState("");

  async function commit() {
    if (!val.trim()) return;
    await add(val);
    setVal("");
  }

  return (
    <Section title="Banned organisations / terrorists watchlist">
      <p className="mb-3 text-xs text-ink-dim">
        System-wide. Any name here is auto-marked <span className="font-medium text-critical">RED</span> wherever it
        appears across every case (brief, accused, headings).
      </p>
      <div className="flex gap-2">
        <input
          className={input}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          placeholder="e.g. ULFA-I, Jaish-e-Mohammed, a wanted name"
        />
        <button onClick={commit} disabled={!val.trim()} className={`${btn("primary")} disabled:opacity-40`}>Add</button>
      </div>
      {names.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {names.map((n) => (
            <span key={n} className="flex items-center gap-1.5 rounded-lg border border-critical/40 bg-critical/15 px-2 py-1 text-xs text-critical">
              {n}
              <button onClick={() => remove(n)} className="text-critical/70 hover:text-critical">✕</button>
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}
