/** Offering preparation does not grant investment decisions or client compliance access. */
export function canManageOfferingRequest(request: Request) {
  const path = new URL(request.url).pathname;
  return (
    /^\/api\/v1\/funds(?:\/\d+)?$/.test(path) ||
    (path === "/api/v1/admin/offering-audience" && request.method === "GET") ||
    (path === "/api/v1/admin/documents" && ["GET", "POST"].includes(request.method))
  );
}
