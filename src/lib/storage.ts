export type IndexEntry = {
  field: string;
  id: string;
  title: string;
  section: string;
  time: string;
};
export function getIndex(): IndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem("ec-index-v1") || "[]");
  } catch {
    return [];
  }
}
export function saveIndex(entries: Omit<IndexEntry, "time">[]) {
  const previous = getIndex();
  const list = [
    ...entries.map((e) => ({ ...e, time: new Date().toISOString() })),
    ...previous,
  ];
  const unique = list
    .filter(
      (e, i) =>
        list.findIndex((x) => x.field === e.field && x.id === e.id) === i,
    )
    .slice(0, 100);
  try {
    localStorage.setItem("ec-index-v1", JSON.stringify(unique));
  } catch {}
  return unique;
}
