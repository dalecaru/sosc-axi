// Fetches the official SOS Contador Postman collection and regenerates the
// OpenAPI spec from it. The Postman documenter is the upstream source of truth.
//
//   bun run sync:openapi            # fetch + write openapi/*
//   bun run sync:openapi --check    # exit 1 if the committed files are stale

const SOURCE =
  "https://documenter.gw.postman.com/api/collections/1566360/SWTD6vnC?segregateAuth=true&versionTag=latest";
const DOCS = "https://documenter.getpostman.com/view/1566360/SWTD6vnC?version=latest";
const BASE = "https://api.sos-contador.com/api-comunidad";
const OUT_JSON = new URL("../openapi/sos-contador.postman.json", import.meta.url);
const OUT_YAML = new URL("../openapi/sos-contador.openapi.yaml", import.meta.url);

type KV = { key: string; value?: string; description?: string | { content: string }; disabled?: boolean };
type Item = {
  name: string;
  description?: string;
  item?: Item[];
  request?: {
    method: string;
    description?: string;
    auth?: { type: string; bearer?: { basicConfig?: KV[] } };
    body?: { mode?: string; raw?: string };
    urlObject?: { path?: string[]; query?: KV[]; variable?: KV[] };
  };
  response?: { code?: number; status?: string; body?: string }[];
};

const text = (d: KV["description"] | string | undefined) =>
  (typeof d === "string" ? d : (d?.content ?? ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || undefined;

const json = (raw: string | undefined) => {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// Postman bearer token variable -> security scheme. {{jwt}} is the user token
// from POST /login, {{jwtc}} the per-CUIT token from GET /cuit/credentials/{idcuit}.
const SCHEMES: Record<string, string> = { "{{jwt}}": "userJwt", "{{jwtc}}": "cuitJwt" };

function toOpenApi(collection: { info: { name: string }; item: Item[] }) {
  const paths: Record<string, Record<string, unknown>> = {};
  const tags: { name: string; description?: string }[] = [];

  const add = (item: Item, tag: string) => {
    const req = item.request!;
    const method = req.method.toLowerCase();
    const segments = req.urlObject?.path ?? [];
    const vars = new Map((req.urlObject?.variable ?? []).map((v) => [v.key, v]));
    const optional = segments.filter((s) => s.startsWith(":") && s.endsWith("?")).map((s) => s.slice(1, -1));

    // OpenAPI has no optional path params: emit one path with and one without them.
    const variants = [segments.map((s) => s.replace(/\?$/, ""))];
    if (optional.length) variants.push(segments.filter((s) => !s.endsWith("?")));

    for (const segs of variants) {
      const path = `/${segs.map((s) => (s.startsWith(":") ? `{${s.slice(1)}}` : s)).join("/")}`;
      paths[path] ??= {};
      if (paths[path][method]) continue; // duplicated in the collection (e.g. "login cuit" == cuit/credentials)

      const parameters = [
        ...segs
          .filter((s) => s.startsWith(":"))
          .map((s) => {
            const v = vars.get(s.slice(1));
            return {
              name: s.slice(1),
              in: "path",
              required: true,
              description: text(v?.description),
              schema: { type: "string" },
              example: v?.value || undefined,
            };
          }),
        ...(req.urlObject?.query ?? [])
          .filter((q) => q.key && !q.disabled)
          .map((q) => ({
            name: q.key,
            in: "query",
            description: text(q.description),
            schema: { type: "string" },
            example: q.value && !q.value.startsWith("{{") ? q.value : undefined,
          })),
      ];

      const bearer = req.auth?.bearer?.basicConfig?.find((c) => c.key === "token")?.value;
      const scheme = bearer && SCHEMES[bearer];
      const body = req.body?.mode === "raw" ? req.body.raw : undefined;
      const examples = (item.response ?? []).filter((r) => json(r.body) !== undefined);

      paths[path][method] = {
        tags: [tag],
        summary: item.name,
        description: text(req.description),
        operationId: `${method}_${segs.filter((s) => !s.startsWith(":")).join("_")}`,
        // No auth in the collection: public for acceso (login/register), otherwise
        // inherit the root cuitJwt default (e.g. mayor/listado omits it upstream).
        security: scheme ? [{ [scheme]: [] }] : tag === "acceso" ? [] : undefined,
        parameters: parameters.length ? parameters : undefined,
        requestBody: body?.trim() ? { content: { "application/json": { example: json(body) ?? body } } } : undefined,
        responses: examples.length
          ? Object.fromEntries(
              examples.map((r) => [
                String(r.code ?? 200),
                { description: r.status ?? "OK", content: { "application/json": { example: json(r.body) } } },
              ]),
            )
          : { "200": { description: "OK" } },
      };
    }
  };

  const walk = (items: Item[], tag?: string) => {
    for (const item of items) {
      if (item.item) {
        const name = tag ?? item.name;
        if (!tag) tags.push({ name, description: text(item.description) });
        walk(item.item, name);
      } else if (item.request) add(item, tag ?? "general");
    }
  };
  walk(collection.item);

  // operationIds must be unique; suffix the optional-param-less variants.
  const seen = new Map<string, number>();
  for (const ops of Object.values(paths))
    for (const op of Object.values(ops) as { operationId: string }[]) {
      const n = (seen.get(op.operationId) ?? 0) + 1;
      seen.set(op.operationId, n);
      if (n > 1) op.operationId += `_${n}`;
    }

  return {
    openapi: "3.0.3",
    info: {
      title: collection.info.name,
      version: "latest",
      description: `Generated by scripts/sync-openapi.ts from the official Postman collection. Do not edit by hand.\n\nSource: ${DOCS}`,
    },
    servers: [{ url: BASE }],
    security: [{ cuitJwt: [] }],
    components: {
      securitySchemes: {
        userJwt: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "User token from POST /login" },
        cuitJwt: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Per-CUIT token (JWTC) from GET /cuit/credentials/{idcuit}",
        },
      },
    },
    tags,
    paths,
  };
}

// Drop undefined values so the YAML output stays clean.
const clean = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

if (import.meta.main) {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch ${SOURCE}: HTTP ${res.status}`);
  const collection = (await res.json()) as { info: { name: string }; item: Item[] };
  const outJson = `${JSON.stringify(collection, null, 2)}\n`;
  const outYaml =
    "# Generated by scripts/sync-openapi.ts - do not edit by hand.\n" +
    Bun.YAML.stringify(clean(toOpenApi(collection)), null, 2) +
    "\n";

  if (process.argv.includes("--check")) {
    const read = (f: URL) =>
      Bun.file(f)
        .text()
        .catch(() => "");
    if ((await read(OUT_JSON)) !== outJson || (await read(OUT_YAML)) !== outYaml) {
      console.error("openapi/ is out of date with the Postman collection. Run `bun run sync:openapi` and commit.");
      process.exit(1);
    }
    console.log("openapi/ is up to date.");
  } else {
    await Bun.write(OUT_JSON, outJson);
    await Bun.write(OUT_YAML, outYaml);
    console.log("wrote openapi/sos-contador.postman.json and openapi/sos-contador.openapi.yaml");
  }
}
