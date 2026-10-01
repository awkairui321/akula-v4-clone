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
