const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type RequestOptions = {
  method?: string;
  body?: Record<string, unknown>;
};

export async function api<T>(
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<T> {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  // Capture JWT from login response
  const authHeader = res.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    localStorage.setItem("token", authHeader.replace("Bearer ", ""));
  }

  return res.json() as Promise<T>;
}

/** Make a request as a seeded persona for the explicitly labeled local comparison demo. */
export async function apiAsDemo<T>(userId: number, path: string, options: RequestOptions = {}): Promise<T> {
  if (import.meta.env.VITE_API_URL) throw new Error("Persona comparison is available only in the simulated demo.");
  const { method = "GET", body } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer mock-token-${userId}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}
