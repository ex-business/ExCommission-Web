import { handleAffiliatePublic } from "./affiliate-public.mjs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { json } from "./http.mjs";
import { session, handleAuth } from "./auth.mjs";
import { handleProxy } from "./proxy.mjs";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
try {
  for (const line of (await readFile(resolve(root, ".env"), "utf8")).split(
    "\n",
  )) {
    const i = line.indexOf("=");
    if (i > 0 && !process.env[line.slice(0, i)])
      process.env[line.slice(0, i)] = line.slice(i + 1).trim();
  }
} catch {}
const spec = JSON.parse(
  await readFile(resolve(root, "contracts/openapi.json"), "utf8"),
);
const routes = Object.entries(spec.paths).flatMap(([path, ops]) =>
  Object.keys(ops).map((method) => ({
    method: method.toUpperCase(),
    re: new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$"),
  })),
);
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const s = session(req);
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        if (!origin || new URL(origin).host !== req.headers.host)
          return json(res, 403, {
            error: { code: "ORIGIN_REJECTED", message: "请求来源不匹配" },
          });
      }
      if (url.pathname === "/affiliate-public")
        return await handleAffiliatePublic(req, res, url);
      if (url.pathname.startsWith("/auth/"))
        return await handleAuth(req, res, url, s);
      if (url.pathname.startsWith("/api/"))
        return await handleProxy(req, res, url, s, routes);
      if (url.pathname === "/healthz")
        return json(res, 200, { status: "ok", mode: "local-sandbox" });
      if (req.method !== "GET" && req.method !== "HEAD")
        return json(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
      const requested =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = resolve(root, "dist", requested);
      if (!file.startsWith(resolve(root, "dist") + "/"))
        return json(res, 404, {});
      try {
        const data = await readFile(file);
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
          }[extname(file)] || "application/octet-stream",
        );
        res.end(data);
      } catch {
        return json(res, 404, { error: { code: "NOT_FOUND" } });
      }
    } catch (err) {
      return json(
        res,
        err.message === "BODY_TOO_LARGE"
          ? 413
          : err instanceof SyntaxError
            ? 400
            : 502,
        {
          error: {
            code:
              err instanceof SyntaxError
                ? "INVALID_JSON"
                : "GATEWAY_UNAVAILABLE",
            message:
              "请求未完成，请核对输入或服务状态；写入请求请保留原幂等键核验",
          },
        },
      );
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const key of [
    "WEB_OPERATOR_PASSWORD",
    "WEB_APPROVER_PASSWORD",
    "LOCAL_OPERATOR_TOKEN",
    "LOCAL_APPROVER_TOKEN",
    "LOCAL_SOURCE_KEY",
  ])
    if (!process.env[key]) throw new Error("Missing " + key);
  createServer().listen(
    Number(process.env.PORT || 18180),
    process.env.BIND_HOST || "127.0.0.1",
    () =>
      console.log(
        "ExCommission-Web http://127.0.0.1:" + (process.env.PORT || 18180),
      ),
  );
}
