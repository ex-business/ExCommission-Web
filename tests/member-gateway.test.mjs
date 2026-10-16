import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../server/index.mjs";
const token = "test-private-member-token",
  received = [];
let trusted = true;
const upstream = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  received.push({ path: req.url, headers: req.headers, raw });
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/auth/login")
    return res.end(JSON.stringify({ access_token: token }));
  if (req.url === "/v1/auth/me")
    return res.end(
      JSON.stringify({
        subject_id: trusted ? "member-test" : "local-operator",
        member_user_id: trusted ? "usr-test" : "",
        permissions: trusted
          ? ["member:read", "member:claim"]
          : ["payments:write"],
      }),
    );
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
test("会员登录由后端确认可信绑定，令牌只存服务端", async () => {
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({
      role: "member",
      username: "member",
      password: "test-password",
    }),
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  const body = await r.json();
  csrf = body.csrf;
  assert.equal(body.subject, "member-test");
  assert.ok(!JSON.stringify(body).includes(token));
});
test("会员只代理本人接口，保留幂等与CSRF并忽略伪造身份", async () => {
  let r = await fetch(base + "/api/v1/me/commissions", {
    headers: {
      Cookie: cookie,
      Authorization: "Bearer forged",
      "X-Tenant-ID": "other",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(received.at(-1).headers.authorization, "Bearer " + token);
  assert.equal(received.at(-1).headers["x-tenant-id"], undefined);
  const before = received.length;
  r = await fetch(base + "/api/v1/payout-orders", {
    headers: { Cookie: cookie },
  });
  assert.equal(r.status, 403);
  assert.equal(received.length, before);
  r = await fetch(base + "/api/v1/me/commission-orders/i1/claim", {
    method: "POST",
    headers: { Cookie: cookie, Origin: base, "Idempotency-Key": "claim-key" },
    body: '{"expected_revision":1}',
  });
  assert.equal(r.status, 403);
  r = await fetch(base + "/api/v1/me/commission-orders/i1/claim", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "claim-key",
    },
    body: '{"expected_revision":1}',
  });
  assert.equal(r.status, 200);
  assert.equal(received.at(-1).headers["idempotency-key"], "claim-key");
});
test("选择会员身份不能把后台账号变成会员", async () => {
  trusted = false;
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({
      role: "member",
      username: "operator",
      password: "test-password",
    }),
  });
  assert.equal(r.status, 401);
});
