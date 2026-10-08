const SHOWCASE_CLIENTS = new Set([2, 11, 14, 16, 19, 30]);
export function inDemoClientCohort(id: number, approved: boolean, preparedByRm = false) {
  return approved && (SHOWCASE_CLIENTS.has(id) || id > 34 || preparedByRm);
}
