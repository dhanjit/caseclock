/** Short app-generated id. Local-only, single-user — no coordination needed. */
export function newId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
