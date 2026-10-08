import fs from "node:fs";

// Read-only advisory lookup for the versions already recorded in package-lock.json.
// Does not install packages, alter the lockfile, or attempt automatic fixes.
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const versions = {};
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.includes("node_modules/") || !entry.version) continue;
  const name = location.split("node_modules/").at(-1);
  versions[name] = [...new Set([...(versions[name] ?? []), entry.version])];
}
const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(versions),
});
if (!response.ok) throw new Error(`Advisory lookup failed: ${response.status}`);
const raw = await response.json();
const advisories = Object.entries(raw).flatMap(([name, entries]) =>
  entries.map((entry) => ({
    package: name,
    installedVersions: versions[name],
    severity: entry.severity,
    title: entry.title,
    vulnerableRange: entry.vulnerable_versions,
    url: entry.url,
  })),
);
const result = {
  at: new Date().toISOString(),
  affectedPackages: Object.keys(raw).length,
  advisories,
};
fs.writeFileSync("docs/audit/dependency-advisories.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
