/**
 * Offline heuristic field extraction (REQUIREMENTS §7) — the dependable, fully
 * local layer beneath OCR and the optional LLM. Pulls letter numbers, dates,
 * document type, subject, FIR no. and sections out of: an index file (CSV/JSON),
 * a filename convention (date_type_reference), or raw document text (PDF/Word/OCR).
 *
 * Pure + deterministic + no network. Every result is a DRAFT for the officer to
 * confirm — these are best-effort patterns, never verified truth (§7).
 */

export interface ExtractedFields {
  letterNo?: string;
  dateOnDoc?: string; // ISO yyyy-mm-dd
  type?: string;
  subject?: string;
  sections?: string;
  firNo?: string;
  direction?: "in" | "out";
  fileName?: string;
  confidence: number; // 0..1, higher = more fields recognised
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Normalise the first recognisable date in a string to ISO. Day-first (Indian). */
export function normalizeDate(input: string): string | null {
  const s = input.trim();
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/); // ISO
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/); // dd/mm/yyyy (day-first)
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/); // 5 Jan 2026
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/); // Jan 5, 2026
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[2]);
  }
  return null;
}

const TYPE_RULES: [RegExp, string][] = [
  [/\b(fsl|forensic|ballistic|cfsl|chemical examiner|serolog|dna)/i, "FSL / forensic report"],
  [/look[\s-]?out circular|\bloc[\s-]?\d|\bloc\b/i, "LOC"],
  [/\bsanction/i, "Sanction order"],
  [/\bcharge\s?sheet|final report/i, "Chargesheet / final report"],
  [/\b(summons|warrant|nbw|proclamation)\b/i, "Court process"],
  [/\b(remand|police custody|judicial custody)\b/i, "Remand / custody"],
  [/\b(letters? rogatory|mla|mutual legal assistance)\b/i, "MLA / Letters Rogatory"],
  [/\binterpol|red notice|blue notice\b/i, "Interpol notice"],
  [/\bpost[\s-]?mortem|autopsy\b/i, "Post-mortem report"],
  [/\b(seizure|recovery memo|panchnama|mahazar)\b/i, "Seizure / panchnama"],
  [/\border\b/i, "Court order"],
];

export function guessType(text: string): string | undefined {
  for (const [re, label] of TYPE_RULES) if (re.test(text)) return label;
  return undefined;
}

const LETTER_NO_RES = [
  /(?:letter|ref(?:erence)?|memo|c\.?\s?no|crime no|no|number)\.?\s*[:#-]?\s*([A-Za-z]{0,8}[-/]?\d{1,6}\/\d{2,4}(?:[/-][A-Za-z0-9]+)?)/i,
  // Bare reference token: 2-8 letters, up to two -/-separated alnum chunks, ending
  // with /digits — matches LOC-2210/24, REF-FR/12, NCB-Req/77, FSL-889/2026.
  /\b([A-Za-z]{2,8}(?:[-/][A-Za-z0-9]{1,10}){0,2}\/\d{1,6})\b/i,
];

export function extractLetterNo(text: string): string | undefined {
  for (const re of LETTER_NO_RES) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return undefined;
}

export function extractFirNo(text: string): string | undefined {
  const m = text.match(/\bFIR\s*(?:no\.?)?\s*[:#-]?\s*(\d{1,5}\/\d{2,4})\b/i);
  return m ? m[1] : undefined;
}

export function extractSections(text: string): string | undefined {
  const m = text.match(
    /([A-Za-z().]*\s?(?:ss?\.?|sections?)\s?[\d,\s.()A-Za-z]{2,40}?(?:IPC|BNS|UA\(?P\)?A|BNSS|CrPC|Arms Act|Explosive Substances))/i,
  );
  return m ? m[1].trim().replace(/\s+/g, " ") : undefined;
}

export function extractSubject(text: string): string | undefined {
  const m = text.match(/\b(?:subject|sub)\s*[:\-]\s*(.+)/i);
  if (m) return m[1].trim().slice(0, 140);
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 8 && l.length < 160);
  return firstLine;
}

/** Extract structured fields from raw document TEXT (PDF/Word text layer, or OCR). */
export function extractFields(text: string): ExtractedFields {
  const letterNo = extractLetterNo(text);
  const dateContext = text.match(/dated?\s*[:\-]?\s*([0-9A-Za-z .,/-]{6,22})/i)?.[1];
  const dateOnDoc = (dateContext && normalizeDate(dateContext)) || normalizeDate(text) || undefined;
  const type = guessType(text);
  const subject = extractSubject(text);
  const sections = extractSections(text);
  const firNo = extractFirNo(text);
  const found = [letterNo, dateOnDoc, type, subject].filter(Boolean).length;
  return {
    letterNo,
    dateOnDoc,
    type,
    subject,
    sections,
    firNo,
    confidence: Math.min(0.9, 0.3 + found * 0.15),
  };
}

/** Parse the `date_type_reference.ext` filename convention (+ general fallbacks). */
export function parseFilename(name: string): ExtractedFields {
  const base = name.replace(/\.[^.]+$/, "");
  const parts = base.split(/[_]+/).filter(Boolean);

  let dateOnDoc: string | undefined;
  let type: string | undefined;
  let letterNo: string | undefined;
  for (const p of parts) {
    if (!dateOnDoc) {
      const d = normalizeDate(p);
      if (d) {
        dateOnDoc = d;
        continue;
      }
    }
    if (!type) {
      const t = guessType(p);
      if (t) {
        type = t;
        continue;
      }
    }
    if (!letterNo) {
      const l = extractLetterNo(p) ?? (/\d/.test(p) && /[A-Za-z]/.test(p) && p.length <= 24 ? p : undefined);
      if (l) {
        letterNo = l;
        continue;
      }
    }
  }
  dateOnDoc = dateOnDoc ?? normalizeDate(base) ?? undefined;
  type = type ?? guessType(base);
  letterNo = letterNo ?? extractLetterNo(base);
  const found = [dateOnDoc, type, letterNo].filter(Boolean).length;
  return {
    dateOnDoc,
    type,
    letterNo,
    subject: base.replace(/[_-]+/g, " ").trim() || undefined,
    fileName: name,
    confidence: Math.min(0.85, 0.25 + found * 0.18),
  };
}

// --- index file (CSV / JSON) -------------------------------------------------

const HEADER_ALIASES: Record<string, keyof ExtractedFields> = {
  "letter no": "letterNo", "letterno": "letterNo", "letter number": "letterNo",
  "ref": "letterNo", "reference": "letterNo", "ref no": "letterNo", "no": "letterNo", "number": "letterNo",
  date: "dateOnDoc", "date on doc": "dateOnDoc", "doc date": "dateOnDoc", dated: "dateOnDoc",
  type: "type", category: "type", subject: "subject", description: "subject", desc: "subject",
  direction: "direction", file: "fileName", filename: "fileName", "file name": "fileName",
  sections: "sections", fir: "firNo", "fir no": "firNo",
};

function fieldsFromMap(row: Record<string, string>): ExtractedFields {
  const out: ExtractedFields = { confidence: 0.9 };
  for (const [rawKey, value] of Object.entries(row)) {
    const key = HEADER_ALIASES[rawKey.trim().toLowerCase()];
    if (!key || !value) continue;
    if (key === "dateOnDoc") out.dateOnDoc = normalizeDate(value) ?? value.trim();
    else if (key === "direction") out.direction = /out|disp|sent/i.test(value) ? "out" : /in|recv|recd|received/i.test(value) ? "in" : undefined;
    else if (key === "confidence") void 0;
    else (out[key] as string) = value.trim();
  }
  return out;
}

function parseCsv(text: string): ExtractedFields[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: ExtractedFields[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const map: Record<string, string> = {};
    headers.forEach((h, j) => (map[h] = cells[j] ?? ""));
    const f = fieldsFromMap(map);
    if (f.letterNo || f.dateOnDoc || f.subject || f.type) rows.push(f);
  }
  return rows;
}

/** Minimal RFC-4180-ish CSV line splitter (handles quotes + embedded commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse an index file (auto-detect JSON array/object vs CSV). */
export function parseIndexFile(content: string): ExtractedFields[] {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(data) ? data : [data];
      return arr
        .filter((r): r is Record<string, string> => !!r && typeof r === "object")
        .map((r) => fieldsFromMap(r as Record<string, string>))
        .filter((f) => f.letterNo || f.dateOnDoc || f.subject || f.type);
    } catch {
      /* fall through to CSV */
    }
  }
  return parseCsv(trimmed);
}
