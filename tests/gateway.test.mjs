import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../server/index.mjs";
process.env.WEB_OPERATOR_PASSWORD = "operator-test-secret";
process.env.WEB_APPROVER_PASSWORD = "approver-test-secret";
process.env.LOCAL_OPERATOR_TOKEN = "backend-operator-secret";
process.env.LOCAL_APPROVER_TOKEN = "backend-approver-secret";
process.env.LOCAL_SOURCE_KEY = "source-test-key";
const received = [];
const upstream = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  received.push({ path: req.url, headers: req.headers, raw });
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ data: { ok: true } }));
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
process.env.BACKEND_URL = "http://127.0.0.1:" + upstream.address().port;
const app = createServer();
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + app.address().port;
let cookie, csrf;
test.after(() => {
  app.close();
  upstream.close();
});
test("匿名请求不能代理业务", async () => {
  const r = await fetch(base + "/api/v1/platform/catalogs");
  assert.equal(r.status, 401);
});
test("拒绝跨来源登录", async () => {
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: "http://evil.example" },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("本地身份建立HttpOnly会话且响应不含后端密钥", async () => {
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({
      role: "operator",
      password: process.env.WEB_OPERATOR_PASSWORD,
    }),
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const b = await r.json();
  csrf = b.csrf;
  assert.equal(b.subject, "local-operator");
  assert.ok(!JSON.stringify(b).includes(process.env.LOCAL_OPERATOR_TOKEN));
});
test("只转发受控身份，不转发浏览器伪造权限与租户头", async () => {
  const r = await fetch(base + "/api/v1/platform/catalogs", {
    headers: {
      Cookie: cookie,
      Authorization: "Bearer forged",
      "X-Tenant-ID": "other",
    },
  });
  assert.equal(r.status, 200);
  const x = received.at(-1);
  assert.equal(x.headers.authorization, "Bearer backend-operator-secret");
  assert.equal(x.headers["x-tenant-id"], undefined);
});
test("无CSRF写操作被拒绝", async () => {
  const r = await fetch(base + "/api/v1/agents", {
    method: "POST",
    headers: { Cookie: cookie, Origin: base },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("付款回调不允许管理端代签", async () => {
  const r = await fetch(base + "/api/v1/payment-callbacks/sandbox", {
    method: "POST",
    headers: { Cookie: cookie, Origin: base, "X-CSRF-Token": csrf },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("来源事实保留原字节签名和原幂等键", async () => {
  const body = JSON.stringify({ source_id: "sandbox", event_id: "e1" });
  const r = await fetch(base + "/api/v1/events", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "stable-key",
    },
    body,
  });
  assert.equal(r.status, 200);
  const x = received.at(-1);
  assert.equal(x.raw, body);
  assert.equal(x.headers["idempotency-key"], "stable-key");
  const { createHmac } = await import("node:crypto");
  assert.equal(
    x.headers["x-source-signature"],
    createHmac("sha256", "source-test-key").update(body).digest("hex"),
  );
});
test("未知代理路径不能访问任意后端资源", async () => {
  assert.equal(
    (await fetch(base + "/api/admin", { headers: { Cookie: cookie } })).status,
    404,
  );
});
test("会员统计仅由申请身份按原字节签名转发", async () => {
  const raw = JSON.stringify({
    user_id: "u1",
    currency: "USD",
    deposit_minor: "10",
  });
  const r = await fetch(base + "/api/v1/member-statistics", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "stats-key",
    },
    body: raw,
  });
  assert.equal(r.status, 200);
  const x = received.at(-1);
  const { createHmac } = await import("node:crypto");
  assert.equal(x.raw, raw);
  assert.equal(
    x.headers["x-source-signature"],
    createHmac("sha256", "source-test-key").update(raw).digest("hex"),
  );
});
test("谷歌验证码仅经请求头转发且格式受限", async () => {
  let r = await fetch(base + "/api/v1/site-agent-config-requests", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "totp-key",
      "X-TOTP-Code": "123456",
    },
    body: '{"enabled":false}',
  });
  assert.equal(r.status, 200);
  const x = received.at(-1);
  assert.equal(x.headers["x-totp-code"], "123456");
  assert.equal(x.raw, '{"enabled":false}');
  r = await fetch(base + "/api/v1/site-agent-config-requests", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "totp-key",
      "X-TOTP-Code": "not-a-code",
    },
    body: "{}",
  });
  assert.equal(r.status, 400);
});
test("退出令会话失效", async () => {
  assert.equal(
    (
      await fetch(base + "/auth/logout", {
        method: "POST",
        headers: { Cookie: cookie, Origin: base, "X-CSRF-Token": csrf },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/auth/session", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});
