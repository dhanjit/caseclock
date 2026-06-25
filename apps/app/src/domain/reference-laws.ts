/**
 * Reference laws (REQUIREMENTS §5) — preloaded, read-only, with citations and
 * official-source links. CONVENIENCE references only — the bare Act on India Code
 * is authoritative; verify before relying. Concise key provisions + the scheduled
 * offences; not the full text.
 */

export interface ReferenceLaw {
  title: string;
  citation: string;
  source: string; // official link
  provisions: { label: string; text: string }[];
}

export const REFERENCE_LAWS: ReferenceLaw[] = [
  {
    title: "NIA Act, 2008 (as amended by the NIA (Amendment) Act, 2019)",
    citation: "Act 34 of 2008; amended by Act 16 of 2019",
    source: "https://www.indiacode.nic.in/handle/123456789/2042",
    provisions: [
      { label: "Scheme", text: "Constitutes the National Investigation Agency to investigate and prosecute 'Scheduled Offences' affecting national security, with concurrent jurisdiction and Special Courts (Ch. IV)." },
      { label: "Scheduled Offences (the Schedule)", text: "Offences under: Explosive Substances Act 1908; Atomic Energy Act 1962; Unlawful Activities (Prevention) Act 1967; Anti-Hijacking Act 2016; Suppression of Unlawful Acts against Safety of Civil Aviation Act 1982; SAARC Convention (Suppression of Terrorism) Act 1993; Maritime navigation / Fixed Platforms Act 2002; WMD Act 2005; and specified offences under the IPC/BNS." },
      { label: "2019 amendment", text: "Expanded the Schedule (added the Explosives Act 1884, the Arms Act 1959, human trafficking, counterfeit currency/banknotes, cyber-terrorism); empowered NIA officers to investigate scheduled offences committed outside India; allowed designation of Special Courts." },
      { label: "Handover (s.6)", text: "On a scheduled offence, the State forwards the report to the Central Government 'as expeditiously as possible'; the Centre decides within ~15 days whether NIA takes over; on direction the State ceases and transmits records." },
    ],
  },
  {
    title: "Unlawful Activities (Prevention) Act, 1967 (as amended 2019)",
    citation: "Act 37 of 1967; amended by Act 28 of 2019",
    source: "https://www.indiacode.nic.in/handle/123456789/1470",
    provisions: [
      { label: "Terrorist act (s.15) / punishment (s.16)", text: "Defines a terrorist act; s.16 punishes it (death/life if it causes death, else 5 yrs–life)." },
      { label: "Conspiracy / membership (ss.18, 20)", text: "Conspiring, organising terror camps, recruiting, and membership of a terrorist organisation are punishable." },
      { label: "s.43-D — modified custody/bail", text: "Chargesheet period extendable to 180 days (on a Public Prosecutor's report showing progress, BEFORE day 90); s.43-D(5) bars bail if the court finds the accusation prima facie true (NIA v. Watali, 2019)." },
      { label: "Sanction (s.45)", text: "Prosecution requires sanction; the UAP (Recommendation and Sanction of Prosecution) Rules, 2008 set time-bound steps (~7 working days each)." },
      { label: "Designation (2019)", text: "The Centre may designate individuals as terrorists (Fourth Schedule), not only organisations." },
    ],
  },
  {
    title: "The Foreigners Act, 1946",
    citation: "Act 31 of 1946",
    source: "https://www.indiacode.nic.in/handle/123456789/2305",
    provisions: [
      { label: "Powers (s.3)", text: "The Central Government may make orders regulating the presence, movement, and departure of foreigners (restriction, removal, internment)." },
      { label: "Burden of proof (s.9)", text: "Where the nationality of a person is in question, the onus of proving they are not a foreigner lies on that person." },
      { label: "Penalty (s.14)", text: "Contravention of the Act/orders is punishable with imprisonment up to 5 years and fine (enhanced for forged documents)." },
    ],
  },
  {
    title: "The Emigration Act, 1983",
    citation: "Act 31 of 1983",
    source: "https://www.indiacode.nic.in/handle/123456789/1900",
    provisions: [
      { label: "Scheme", text: "Regulates the emigration of Indian citizens for overseas employment through registered recruiting agents and emigration clearance (Protector of Emigrants)." },
      { label: "Offences (ss.24–26)", text: "Recruiting without registration, charging excess fees, and emigration in contravention of the Act are punishable (imprisonment + fine) — relevant to trafficking / illegal recruitment investigations." },
    ],
  },
];
