// Shared list-pagination math (playbook PROMPT 27). Pure functions — unit
// tested directly under Node. The admin lists fetch every row paged
// (fetchAllRows in lib/admin-export, which pages around the PostgREST
// response cap) and then RENDER page by page, so long lists never hide
// rows behind a silent cap and never render thousands of DOM rows at once.

export const LIST_PAGE_SIZE = 25;

// Always at least one page so the pager stays coherent for empty lists.
export function pageCount(total: number, pageSize: number = LIST_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

// Coerces any requested page into [1, pageCount].
export function clampPage(page: number, total: number, pageSize: number = LIST_PAGE_SIZE): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), pageCount(total, pageSize));
}

export function pageSlice<T>(
  rows: readonly T[],
  page: number,
  pageSize: number = LIST_PAGE_SIZE,
): T[] {
  const safe = clampPage(page, rows.length, pageSize);
  const start = (safe - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

// "1–25 of 312" for the pager summary; empty lists read "0".
export function pageSummary(total: number, page: number, pageSize: number = LIST_PAGE_SIZE): string {
  if (!Number.isFinite(total) || total <= 0) return "0";
  const safe = clampPage(page, total, pageSize);
  const start = (safe - 1) * pageSize + 1;
  const end = Math.min(safe * pageSize, total);
  return `${start}–${end} of ${total}`;
}
