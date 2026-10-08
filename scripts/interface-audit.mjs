import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const source = path.resolve("src");
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(file);
    else if (/\.[jt]sx?$/.test(file)) files.push(file);
  }
}
walk(source);
const routes = [];
const links = [];
const endpoints = [];
const formButtons = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(n) {
    const loc = {
      file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
      line: tree.getLineAndCharacterOfPosition(n.getStart()).line + 1,
    };
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
      const name = n.name.getText(tree),
        value = n.initializer.text;
      if (name === "path" && loc.file === "src/App.tsx") routes.push(value);
      if (["href", "to"].includes(name)) links.push({ ...loc, value });
    }
    if (
      ts.isPropertyAssignment(n) &&
      ["to", "href"].includes(n.name.getText(tree)) &&
      ts.isStringLiteral(n.initializer)
    )
      links.push({ ...loc, value: n.initializer.text });
    if (
      ts.isCallExpression(n) &&
      ["navigate", "window.open"].includes(n.expression.getText(tree)) &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    )
      links.push({ ...loc, value: n.arguments[0].text });
    if (
      ts.isCallExpression(n) &&
      /^http\.(get|post|patch|put|delete)$/.test(n.expression.getText(tree)) &&
      ts.isStringLiteral(n.arguments[0])
    )
      endpoints.push({
        ...loc,
        method: n.expression.name.text.toUpperCase(),
        route: n.arguments[0].text.replace("*", ""),
      });
    if (ts.isJsxOpeningElement(n) && n.tagName.getText(tree) === "Button") {
      let ancestor = n.parent.parent;
      while (
        ancestor &&
        !(ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(tree) === "form")
      )
        ancestor = ancestor.parent;
      const attrs = n.attributes.properties.map((p) => p.name?.getText(tree));
      if (ancestor && !attrs.includes("type") && !attrs.includes("onClick"))
        formButtons.push({
          ...loc,
          label: n.parent.children
            .map((c) => c.getText(tree))
            .join("")
            .trim(),
        });
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
}
const matches = (pattern, value) =>
  new RegExp(
    "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[^/]+/g, "[^/]+") + "/?$",
  ).test(value);
const missingLinks = links.filter(
  (l) =>
    l.value.startsWith("/") &&
    !l.value.startsWith("/api/") &&
    !routes.some((r) => matches(r, l.value.split(/[?#]/)[0])),
);
const db = await import(pathToFileURL(path.resolve(".test-runtime/src/mocks/db.mjs")));
const w = await import(pathToFileURL(path.resolve(".test-runtime/src/mocks/workflow.mjs")));
const { handlers } = await import(
  pathToFileURL(path.resolve(".test-runtime/src/mocks/handlers/index.mjs"))
);
w.seedWorkflow();
const roles = ["luca", "investment_team", "rm", "ops", "investor", "eam"];
const users = roles.map((role) => db.users.find((u) => u.role === role)).filter(Boolean);
async function request(route, user, method = "GET", body) {
  const request = new Request("http://localhost:3000" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Authorization: `Bearer ${db.tokenFor(user.id)}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const h of handlers)
    if (await h.test({ request: request.clone() })) {
      const result = await h.run({ request: request.clone(), requestId: crypto.randomUUID() });
      if (result?.response) return result.response;
    }
  return null;
}
const probes = [];
for (const endpoint of endpoints.filter(
  (e) => e.method === "GET" && !e.route.includes(":") && !e.route.includes("/public/"),
)) {
  for (const user of [null, ...users]) {
    try {
      const response = await request(endpoint.route, user);
      probes.push({
        route: endpoint.route,
        role: user?.role ?? "guest",
        status: response?.status ?? "unhandled",
      });
    } catch (e) {
      probes.push({ route: endpoint.route, role: user?.role ?? "guest", error: e.message });
    }
  }
}
const downloads = db.documents
  .filter((d) => d.has_file && !d.file_data_url)
  .map((d) => ({ id: d.id, name: d.name, fund: d.fund_id, status: d.status }));
const browserFile = "docs/audit/browser-checks.json";
const browser = fs.existsSync(browserFile)
  ? JSON.parse(fs.readFileSync(browserFile, "utf8"))
  : null;
const renderedLinks =
  browser?.checks.flatMap((p) =>
    (p.links ?? []).map((l) => ({ ...l, page: p.path, role: p.role })),
  ) ?? [];
const missingRenderedLinks = renderedLinks.filter(
  (l) =>
    l.href.startsWith("/") &&
    !l.href.startsWith("/api/") &&
    !routes.some((r) => matches(r, l.href.split(/[?#]/)[0])),
);
const externalLinks = [
  ...new Set(renderedLinks.filter((l) => /^https?:/.test(l.href)).map((l) => l.href)),
];
const result = {
  at: new Date().toISOString(),
  sourceFiles: files.length,
  routes,
  links,
  missingLinks,
  endpoints,
  formButtons,
  probes,
  seedDocumentsWithoutBytes: downloads,
  downloadHandlerPresent: endpoints.some((e) => /documents.*download/.test(e.route)),
  browserCoverage: {
    captures: browser?.checks.length ?? 0,
    uniquePaths: new Set(browser?.checks.map((p) => p.path) ?? []).size,
    renderedLinkOccurrences: renderedLinks.length,
    missingRenderedLinks,
    externalLinks,
  },
};
fs.mkdirSync("docs/audit", { recursive: true });
fs.writeFileSync("docs/audit/interface-audit-results.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      sourceFiles: files.length,
      routes: routes.length,
      linkLocations: links.length,
      missingLinks,
      endpoints: endpoints.length,
      formButtons,
      readProbes: probes.length,
      guestUnexpected: probes.filter((p) => p.role === "guest" && p.status !== 401),
      errors: probes.filter((p) => p.error || p.status === "unhandled"),
      seedDocumentsWithoutBytes: downloads.length,
      downloadHandlerPresent: result.downloadHandlerPresent,
      roles: users.map((u) => ({ id: u.id, role: u.role, email: u.email })),
    },
    null,
    2,
  ),
);
