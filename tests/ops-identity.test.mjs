import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../server/index.mjs";
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", r));
const close = (s) => new Promise((r) => s.close(r));
test("独立业务后台依赖公共运营身份，私有凭据、切站绑定、撤权及无共享口令回退", async () => {
  let revoked = false,
    logout = false,
    seen,
    identityRequests = [];
  let holdNextMe = false,
    releaseMe,
    heldReady;
  const opsCookie = "c".repeat(64);
  const identity = http.createServer(async (req, res) => {
    identityRequests.push(req.url);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/security-settings") {
      res.end('{"require_otp":false}');
      return;
    }
    if (req.url === "/api/login") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const input = JSON.parse(Buffer.concat(chunks));
      if (
        input.username !== "person" ||
        input.password !== "personal-password"
      ) {
        res.statusCode = 401;
        res.end('{"error":"账号或密码错误"}');
        return;
      }
      res.setHeader(
        "set-cookie",
        "ops_session=" + opsCookie + "; HttpOnly; Path=/",
      );
      res.end('{"csrf":"ops-csrf"}');
      return;
    }
    if (revoked || !req.headers.cookie?.includes("ops_session=" + opsCookie)) {
      res.statusCode = 401;
      res.end('{"error":"会话失效"}');
      return;
    }
    if (req.url === "/api/me") {
      if (holdNextMe) {
        holdNextMe = false;
        await new Promise((resolve) => {
          releaseMe = resolve;
          heldReady();
        });
      }
      res.end(
        JSON.stringify({
          account: { id: 12, name: "运营人员", must_change_password: false },
          csrf: "ops-csrf",
          grants: [
            { site_id: "A", role: "viewer" },
            { site_id: "B", role: "applicant" },
          ],
        }),
      );
      return;
    }
    if (req.url === "/api/sites") {
      res.end(
        JSON.stringify([
          { id: "A", name: "站点A", active: 1 },
          { id: "B", name: "站点B", active: 1 },
          { id: "outside-business", name: "其他业务站点", active: 1 },
        ]),
      );
      return;
    }
    if (req.url === "/api/logout") {
      logout = true;
      res.end('{"ok":true}');
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await listen(identity);
  const backend = http.createServer((req, res) => {
    seen = req.headers;
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      res.statusCode = 403;
      res.end('{"error":{"code":"PERMISSION_DENIED"}}');
    } else res.end('{"data":{"configured":true}}');
  });
  await listen(backend);
  const saved = {};
  for (const key of [
    "OPS_IDENTITY_URL",
    "OPS_IDENTITY_ORIGIN",
    "OPS_SITE_IDS",
    "BACKEND_URL",
    "WEB_OPERATOR_PASSWORD",
  ])
    saved[key] = process.env[key];
  process.env.OPS_IDENTITY_URL = "http://127.0.0.1:" + identity.address().port;
  process.env.OPS_IDENTITY_ORIGIN = "http://127.0.0.1:19586";
  process.env.OPS_SITE_IDS = "A,B";
  process.env.BACKEND_URL = "http://127.0.0.1:" + backend.address().port;
  process.env.WEB_OPERATOR_PASSWORD = "shared-key";
  const web = createServer();
  await listen(web);
  const origin = "http://127.0.0.1:" + web.address().port;
  let cookie = "",
    csrf = "";
  const call = async (path, { body, site = "A", token = csrf } = {}) => {
    const r = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        "content-type": "application/json",
        "x-csrf-token": token,
        "x-ops-site-id": site,
        "idempotency-key": "key-test",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    return { r, data };
  };
  try {
    let out = await call("/auth/config");
    assert.equal(out.data.ops, true);
    assert.equal(out.data.require_otp, false);
    out = await call("/auth/login", {
      body: {
        role: "operator",
        username: "person",
        password: "personal-password",
      },
    });
    assert.equal(out.r.status, 200);
    cookie = out.r.headers.get("set-cookie").split(";")[0];
    csrf = out.data.csrf;
    assert.equal(out.data.role, "viewer");
    assert.equal(out.data.subject, "ops-12");
    assert.equal(out.data.ops, true);
    assert.equal(JSON.stringify(out.data).includes(opsCookie), false);
    assert.equal(out.data.opsCSRF, undefined);
    out = await call("/api/v1/affiliate/config");
    assert.equal(out.r.status, 200);
    assert.equal(seen.authorization.startsWith("Bearer ops1."), true);
    assert.equal(seen["x-ops-site-id"], undefined);
    out = await call("/auth/site", { body: { site_id: "outside-business" } });
    assert.equal(out.r.status, 403);
    const held = new Promise((resolve) => {
      heldReady = resolve;
    });
    holdNextMe = true;
    const oldRefresh = call("/auth/session");
    await held;
    out = await call("/auth/site", { body: { site_id: "B" } });
    assert.equal(out.r.status, 200);
    releaseMe();
    assert.equal((await oldRefresh).r.status, 409);
    out = await call("/api/v1/affiliate/config", { site: "A" });
    assert.equal(out.r.status, 409);
    out = await call("/api/v1/affiliate/config-requests", {
      body: {},
      site: "A",
    });
    assert.equal(out.r.status, 409);
    out = await call("/auth/session");
    assert.equal(out.data.site_id, "B");
    assert.equal(out.data.role, "operator");
    csrf = out.data.csrf;
    // 旧业务接口交由后端原权限判定，不再被运营接入层一律拦截。
    seen = undefined;
    out = await call("/api/v1/referral-reward-claims", { body: {}, site: "B" });
    assert.equal(out.r.status, 403);
    assert.match(seen.authorization, /^Bearer ops1\./);
    for (const path of ["plans/example/draft", "reports/earnings", "statements/example"]) {
      out = await call("/api/v1/" + path, {site: "B"});
      assert.equal(out.r.status, 200);
    }
    out = await call("/api/v1/me/affiliate/overview", { site: "B" });
    assert.equal(out.r.status, 403);
    revoked = true;
    out = await call("/api/v1/affiliate/config", { site: "B" });
    assert.equal(out.r.status, 401);
    revoked = false;
    out = await call("/auth/login", {
      body: { role: "operator", username: "unknown", password: "shared-key" },
    });
    assert.equal(out.r.status, 401);
    out = await call("/auth/login", {
      body: {
        role: "operator",
        username: "person",
        password: "personal-password",
      },
    });
    assert.equal(out.r.status, 200);
    cookie = out.r.headers.get("set-cookie").split(";")[0];
    csrf = out.data.csrf;
    const logoutHeld = new Promise((resolve) => {
      heldReady = resolve;
    });
    holdNextMe = true;
    const staleAfterLogout = call("/auth/session");
    await logoutHeld;
    out = await call("/auth/logout", { body: {} });
    assert.equal(out.r.status, 200);
    releaseMe();
    assert.equal((await staleAfterLogout).r.status, 409);
    assert.equal((await call("/auth/session")).r.status, 401);
    assert.equal(logout, true);
    await close(identity);
    const count = identityRequests.length;
    out = await call("/auth/config?role=member");
    assert.equal(out.r.status, 200);
    assert.equal(identityRequests.length, count);
    assert.equal(out.data.require_otp, false);
  } finally {
    releaseMe?.();
    await close(web);
    await close(backend);
    if (identity.listening) await close(identity);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
