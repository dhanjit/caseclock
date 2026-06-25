// Probe 1: Highlighted substring ordering
function highlight(names, text) {
  const escaped = names.map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const lower = new Set(names.map((n) => n.trim().toLowerCase()));
  const parts = text.split(re);
  return parts.map((p) => (lower.has(p.toLowerCase()) ? `[${p}]` : p)).join("");
}
console.log("A:", highlight(["Khan", "Khanna"], "Mr Khanna met Khan"));
console.log("B:", highlight(["Khanna", "Khan"], "Mr Khanna met Khan"));

// Probe 2: empty name in watchlist -> regex
function highlight2(names, text) {
  const escaped = names.map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return "(no names)";
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).length;
}
console.log("empty-only names:", highlight2(["   ", ""], "hello"));

// Probe 3: addMonths leap / month-end
function pad(n){return String(n).padStart(2,"0");}
function parse(d){const [y,m,day]=d.split("-").map(Number);return new Date(Date.UTC(y,m-1,day));}
function format(dt){return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`;}
function addMonths(d,n){const dt=parse(d);const day=dt.getUTCDate();dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+n);const lastDay=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();dt.setUTCDate(Math.min(day,lastDay));return format(dt);}
console.log("Jan31 +1mo:", addMonths("2025-01-31",1));
console.log("Dec31 +2mo (leap target):", addMonths("2023-12-31",2));
console.log("Dec15 +1mo:", addMonths("2025-12-15",1));

// Probe 4: pr-monthly due string vs today slice — what if today before the 7th overdue logic
function diffDays(a,b){return Math.round((parse(a).getTime()-parse(b).getTime())/86400000);}
const today="2025-03-03";
const month=today.slice(0,7);
const due=`${month}-07`;
console.log("pr due", due, "diff(today,due)=", diffDays(today,due));
