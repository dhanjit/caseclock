import { describe, it, expect } from "vitest";
import {
  normalizeDate,
  guessType,
  extractLetterNo,
  extractFirNo,
  extractFields,
  parseFilename,
  parseIndexFile,
} from "./extract";

describe("normalizeDate (day-first / Indian)", () => {
  it("parses ISO, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy", () => {
    expect(normalizeDate("2026-06-05")).toBe("2026-06-05");
    expect(normalizeDate("05/06/2026")).toBe("2026-06-05"); // day-first
    expect(normalizeDate("5-6-2026")).toBe("2026-06-05");
    expect(normalizeDate("05.06.26")).toBe("2026-06-05");
  });
  it("parses '5 Jan 2026' and 'Jan 5, 2026'", () => {
    expect(normalizeDate("5 Jan 2026")).toBe("2026-01-05");
    expect(normalizeDate("5th January, 2026")).toBe("2026-01-05");
    expect(normalizeDate("Jan 5, 2026")).toBe("2026-01-05");
  });
  it("rejects nonsense / out-of-range", () => {
    expect(normalizeDate("hello")).toBeNull();
    expect(normalizeDate("45/13/2026")).toBeNull();
  });
});

describe("type + letter-no + FIR heuristics", () => {
  it("guesses document type from keywords", () => {
    expect(guessType("FSL ballistic examination report")).toMatch(/FSL/);
    expect(guessType("Look Out Circular against accused")).toBe("LOC");
    expect(guessType("Sanction under s.45 UAPA")).toBe("Sanction order");
    expect(guessType("Final report / charge sheet")).toMatch(/Chargesheet/);
  });
  it("extracts letter / reference numbers", () => {
    expect(extractLetterNo("Letter No: LOC-2210/24 dated...")).toBe("LOC-2210/24");
    expect(extractLetterNo("Ref REF-FR/12 regarding")).toBe("REF-FR/12");
  });
  it("extracts FIR numbers", () => {
    expect(extractFirNo("FIR No. 112/2024 PS Latasil")).toBe("112/2024");
  });
});

describe("extractFields (document text)", () => {
  it("pulls letter no, date, type, subject together with a confidence", () => {
    const text = [
      "Office of the FSL, Guwahati",
      "Letter No: FSL-889/2026 dated 05/06/2026",
      "Subject: Ballistic examination report in FIR 112/2024",
      "The exhibits forwarded vide your memo are examined...",
    ].join("\n");
    const f = extractFields(text);
    expect(f.letterNo).toBe("FSL-889/2026");
    expect(f.dateOnDoc).toBe("2026-06-05");
    expect(f.type).toMatch(/FSL/);
    expect(f.subject).toMatch(/Ballistic/);
    expect(f.firNo).toBe("112/2024");
    expect(f.confidence).toBeGreaterThan(0.5);
  });
});

describe("parseFilename (date_type_reference convention)", () => {
  it("splits the convention into date / type / reference", () => {
    const f = parseFilename("2026-06-05_FSL_FSL-889-2026.pdf");
    expect(f.dateOnDoc).toBe("2026-06-05");
    expect(f.type).toMatch(/FSL/);
    expect(f.fileName).toBe("2026-06-05_FSL_FSL-889-2026.pdf");
  });
  it("still extracts a date from a free-form filename", () => {
    const f = parseFilename("scan 05-06-2026 sanction order.jpg");
    expect(f.dateOnDoc).toBe("2026-06-05");
    expect(f.type).toBe("Sanction order");
  });
});

describe("parseIndexFile", () => {
  it("parses a CSV index with aliased headers", () => {
    const csv = [
      "Letter No,Date,Type,Subject,Direction",
      "LOC-2210/24,01/08/2024,LOC,Look-out circular A-4,out",
      'FSL-889/2026,05/06/2026,FSL report,"Ballistic, report",in',
    ].join("\n");
    const rows = parseIndexFile(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].letterNo).toBe("LOC-2210/24");
    expect(rows[0].dateOnDoc).toBe("2024-08-01");
    expect(rows[0].direction).toBe("out");
    expect(rows[1].subject).toBe("Ballistic, report"); // quoted comma preserved
    expect(rows[1].direction).toBe("in");
  });
  it("parses a JSON index array", () => {
    const json = JSON.stringify([
      { letterNo: "REF-FR/12", date: "2026-06-05", subject: "FR buffered target", type: "letter" },
    ]);
    const rows = parseIndexFile(json);
    expect(rows).toHaveLength(1);
    expect(rows[0].letterNo).toBe("REF-FR/12");
    expect(rows[0].dateOnDoc).toBe("2026-06-05");
  });
  it("returns [] for an empty / header-only file", () => {
    expect(parseIndexFile("")).toEqual([]);
    expect(parseIndexFile("Letter No,Date")).toEqual([]);
  });
});
