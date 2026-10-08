/** Persona impersonation exists only inside the explicitly labelled local comparison. */
export function demoPersonaId() {
  if (import.meta.env.VITE_API_URL || typeof window === "undefined" || window.parent === window)
    return null;
  const id = Number(new URLSearchParams(window.location.search).get("demo_persona"));
  return [1, 2, 6, 7, 9000].includes(id) ? id : null;
}
