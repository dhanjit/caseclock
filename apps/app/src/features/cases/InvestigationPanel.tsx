/**
 * Investigation engine inputs (REQUIREMENTS §4.1) — the dates that drive the
 * arrest-anchored FR/chargesheet clock, the FR→SP→DG chain, custody production,
 * and the Progress Reports. Edit-mode form; the rules engine does the rest.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  CUSTODY_CASE_TYPE_LABEL,
  custodyLimits,
  type CaseRecord,
  type CustodyCaseType,
} from "@/domain/types";
import { addDays, todayISO } from "@/rules/dates";
import { fmtDate } from "@/lib/format";
import { Section, Field } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function InvestigationPanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const lim = custodyLimits(c);
  const today = todayISO();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [arrest, setArrest] = useState(c.arrestDate ?? "");
  const [caseType, setCaseType] = useState<CustodyCaseType | "">(c.custodyCaseType ?? "");
  const [uapaDays, setUapaDays] = useState(c.uapaCustodyDays?.toString() ?? "");
  const [custodyEnd, setCustodyEnd] = useState(c.custodyEndDate ?? "");
  const [csFiled, setCsFiled] = useState(c.chargesheetFiledDate ?? "");
  const [frII, setFrII] = useState(c.frIIFiledDate ?? "");
  const [spRemarks, setSpRemarks] = useState(c.spRemarksDate ?? "");
  const [dgOrder, setDgOrder] = useState(c.dgOrderDate ?? "");
  const [firstPr, setFirstPr] = useState(c.firstPrFiledDate ?? "");
  const [firstRemand, setFirstRemand] = useState(c.firstRemandDate ?? "");
  const [custodyStatus, setCustodyStatus] = useState<"" | "not_arrested" | "in_custody" | "on_bail">(c.custodyStatus ?? "");
  const [ppReport, setPpReport] = useState(c.uapaPpReportFiledDate ?? "");
  const [uapaExt, setUapaExt] = useState(!!c.uapaExtensionGranted);
  const [maxSentence, setMaxSentence] = useState(c.maxSentenceYears?.toString() ?? "");
  const [lifeOrDeath, setLifeOrDeath] = useState(!!c.lifeOrDeath);
  const isUapa = lim.caseType === "uapa";

  async function save() {
    setBusy(true);
    try {
      await onSaveCase({
        arrestDate: arrest || null,
        firstRemandDate: firstRemand || null,
        custodyStatus: (custodyStatus || undefined) as CaseRecord["custodyStatus"],
        custodyCaseType: (caseType || null) as CustodyCaseType | null,
        uapaCustodyDays: uapaDays ? Number(uapaDays) : null,
        uapaExtensionGranted: uapaExt,
        uapaPpReportFiledDate: ppReport || null,
        maxSentenceYears: maxSentence ? Number(maxSentence) : null,
        lifeOrDeath,
        custodyEndDate: custodyEnd || null,
        chargesheetFiledDate: csFiled || null,
        frIIFiledDate: frII || null,
        spRemarksDate: spRemarks || null,
        dgOrderDate: dgOrder || null,
        firstPrFiledDate: firstPr || null,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }
  if (editing) {
    return (
      <Section title="Investigation engine — edit" className="mt-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of arrest">
              <input type="date" className={input} value={arrest} onChange={(e) => setArrest(e.target.value)} />
            </Field>
            <Field label="First remand (statutory anchor)">
              <input type="date" className={input} value={firstRemand} onChange={(e) => setFirstRemand(e.target.value)} />
            </Field>
            <Field label="Custody status">
              <select className={input} value={custodyStatus} onChange={(e) => setCustodyStatus(e.target.value as typeof custodyStatus)}>
                <option value="">—</option>
                <option value="not_arrested">Not arrested</option>
                <option value="in_custody">In custody</option>
                <option value="on_bail">On bail</option>
              </select>
            </Field>
            <Field label="Custody case type">
              <select className={input} value={caseType} onChange={(e) => setCaseType(e.target.value as CustodyCaseType | "")}>
                <option value="">Auto ({CUSTODY_CASE_TYPE_LABEL[lim.caseType]})</option>
                <option value="uapa">{CUSTODY_CASE_TYPE_LABEL.uapa}</option>
                <option value="scheduled_higher">{CUSTODY_CASE_TYPE_LABEL.scheduled_higher}</option>
                <option value="scheduled_lower">{CUSTODY_CASE_TYPE_LABEL.scheduled_lower}</option>
              </select>
            </Field>
            <Field label="UAPA target days (default 150)">
              <input className={input} value={uapaDays} onChange={(e) => setUapaDays(e.target.value)} inputMode="numeric" placeholder="150" />
            </Field>
            <Field label="Custody end date (production reminder)">
              <input type="date" className={input} value={custodyEnd} onChange={(e) => setCustodyEnd(e.target.value)} />
            </Field>
            <Field label="Chargesheet / FR-I filed">
              <input type="date" className={input} value={csFiled} onChange={(e) => setCsFiled(e.target.value)} />
            </Field>
            <Field label="First PR filed (≤15d)">
              <input type="date" className={input} value={firstPr} onChange={(e) => setFirstPr(e.target.value)} />
            </Field>
            <Field label="FR-II filed">
              <input type="date" className={input} value={frII} onChange={(e) => setFrII(e.target.value)} />
            </Field>
            <Field label="SP remarks date">
              <input type="date" className={input} value={spRemarks} onChange={(e) => setSpRemarks(e.target.value)} />
            </Field>
            <Field label="DG order date">
              <input type="date" className={input} value={dgOrder} onChange={(e) => setDgOrder(e.target.value)} />
            </Field>
            {isUapa && (
              <Field label="UAPA PP-report filed (≤ day 90)">
                <input type="date" className={input} value={ppReport} onChange={(e) => setPpReport(e.target.value)} />
              </Field>
            )}
            <Field label="Max sentence (years) — for s.479">
              <input className={input} value={maxSentence} onChange={(e) => setMaxSentence(e.target.value)} inputMode="numeric" placeholder="e.g. 7" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            {isUapa && (
              <label className="flex items-center gap-1.5 text-sm text-ink-dim">
                <input type="checkbox" checked={uapaExt} onChange={(e) => setUapaExt(e.target.checked)} />
                UAPA 90→180 extension granted
              </label>
            )}
            <label className="flex items-center gap-1.5 text-sm text-ink-dim">
              <input type="checkbox" checked={lifeOrDeath} onChange={(e) => setLifeOrDeath(e.target.checked)} />
              Life / death case (excludes s.479)
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className={btn("ghost")}>Cancel</button>
            <button onClick={save} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Section>
    );
  }

  const frBuffered = c.arrestDate ? addDays(c.arrestDate, lim.buffered) : null;
  const statutoryAnchor = c.firstRemandDate ?? c.arrestDate;
  const frStatutory = statutoryAnchor ? addDays(statutoryAnchor, lim.statutory) : null;
  const recentMonths = (() => {
    let [y, m] = today.slice(0, 7).split("-").map(Number);
    const out: string[] = [];
    for (let i = 0; i < 4; i++) {
      out.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
    }
    return out;
  })();
  const filedSet = new Set(c.prFiledMonths ?? []);
  const togglePrMonth = (mm: string) => {
    const cur = c.prFiledMonths ?? [];
    onSaveCase({ prFiledMonths: cur.includes(mm) ? cur.filter((x) => x !== mm) : [...cur, mm] });
  };

  return (
    <Section title="Investigation engine" hint={CUSTODY_CASE_TYPE_LABEL[lim.caseType]} className="mt-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <Row k="Arrest" v={fmtDate(c.arrestDate)} />
        <Row k="First remand" v={fmtDate(c.firstRemandDate)} />
        <Row k="Custody status" v={c.custodyStatus ? c.custodyStatus.replace("_", " ") : "—"} />
        <Row k="Chargesheet/FR-I" v={c.chargesheetFiledDate ? `filed ${fmtDate(c.chargesheetFiledDate)}` : "pending"} />
        <Row k={`FR-I target (${lim.buffered}d)`} v={frBuffered ? fmtDate(frBuffered) : "—"} />
        <Row k={`Statutory (${lim.statutory}d)`} v={frStatutory ? fmtDate(frStatutory) : "—"} />
        <Row k="Custody ends" v={fmtDate(c.custodyEndDate)} />
        {isUapa && <Row k="UAPA PP-report" v={c.uapaPpReportFiledDate ? fmtDate(c.uapaPpReportFiledDate) : "pending (≤ day 90)"} />}
        <Row k="FR-II" v={fmtDate(c.frIIFiledDate)} />
        <Row k="SP remarks" v={fmtDate(c.spRemarksDate)} />
        <Row k="DG order" v={fmtDate(c.dgOrderDate)} />
        <Row k="First PR" v={fmtDate(c.firstPrFiledDate)} />
      </dl>
      <div className="mt-3">
        <p className="mb-1 text-xs text-soft">
          Monthly PR{!c.firstPrFiledDate && " — set the First PR date (Edit) to start the cadence"}:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recentMonths.map((mm) => (
            <button
              key={mm}
              onClick={() => togglePrMonth(mm)}
              className={`rounded-lg border px-2 py-1 text-xs ${filedSet.has(mm) ? "border-ok/40 bg-ok/15 text-ok" : "border-line text-ink-dim"}`}
            >
              {mm} {filedSet.has(mm) ? "✓" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setEditing(true)} className={btn("ghost")}>Edit dates</button>
      </div>
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-line/40 py-1">
      <dt className="text-ink-dim">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
