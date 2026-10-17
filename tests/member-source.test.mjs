import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server/index.mjs";

const secret = "s".repeat(32),
  token = "ms_" + "a".repeat(48),
  dir = await mkdtemp(join(tmpdir(), "member-source-"));
let revoked = false,
  legacyCalls = 0,
  trusted = true;
const received = [];
const upstream = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  received.push({ path: req.url, headers: req.headers, raw });
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/integration/")) {
    assert.equal(
      req.headers.authorization,
      "Basic " + Buffer.from("web:" + secret).toString("base64"),
    );
    if (req.url === "/integration/login") {
      const input = JSON.parse(raw);
      if (
        input.username !== "member@test.example" ||
        input.password !== "correct-password"
      ) {
        res.writeHead(401);
        return res.end("{}");
      }
      return res.end(JSON.stringify({ access_token: token }));
    }
    if (req.url === "/integration/revoke") {
      assert.equal(new URLSearchParams(raw).get("token"), token);
      revoked = true;
      return res.end("{}");
    }
  }
  if (req.url === "/v1/auth/login") {
    legacyCalls++;
    return res.end("{}");
  }
  if (req.url === "/v1/auth/me") {
    assert.equal(req.headers.authorization, "Bearer " + token);
    return res.end(
      JSON.stringify({
        subject_id: "member-real",
        member_user_id: trusted ? "usr-real" : "",
        permissions: trusted ? ["member:read"] : [],
      }),
    );
  }
  res.end("{}");
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const source = "http://127.0.0.1:" + upstream.address().port;
await writeFile(
  join(dir, "private.json"),
  JSON.stringify({
    login_url: source + "/integration/login",
    revoke_url: source + "/integration/revoke",
    client_id: "web",
    client_secret: secret,
    local_sandbox: true,
  }),
  { mode: 0o600 },
);
process.env.MEMBER_SOURCE_FILE = join(dir, "private.json");
process.env.BACKEND_URL = source;
const app = createServer();
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + app.address().port;
test.after(async () => {
  app.close();
  upstream.close();
  await rm(dir, { recursive: true, force: true });
  delete process.env.MEMBER_SOURCE_FILE;
});
let cookie, csrf;
const login = (password) =>
  fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({
      role: "member",
      username: "member@test.example",
      password,
      member_user_id: "forged",
    }),
  });
test("模拟会员来源登录并经佣金后端二次校验，浏览器不获得令牌或接入密钥", async () => {
  const r = await login("correct-password");
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  const raw = await r.text();
  const body = JSON.parse(raw);
  csrf = body.csrf;
  assert.equal(body.subject, "member-real");
  assert.ok(!raw.includes(token) && !raw.includes(secret));
  assert.equal(legacyCalls, 0);
  const p = await fetch(base + "/api/v1/me/commissions", {
    headers: {
      Cookie: cookie,
      Authorization: "Bearer forged",
      "X-Tenant-ID": "other",
    },
  });
  assert.equal(p.status, 200);
  assert.equal(received.at(-1).headers.authorization, "Bearer " + token);
  assert.equal(received.at(-1).headers["x-tenant-id"], undefined);
});
test("真实会员会话领取经过CSRF并签名实际连接IP，伪造上下文不被转发", async () => {
  process.env.AFFILIATE_CLIENT_CONTEXT_KEY = "k".repeat(32);
  process.env.LOCAL_TENANT = "tenant";
  process.env.LOCAL_APP = "app";
  const uri = "/v1/me/affiliate/claims", raw = '{"kind":"ALL"}';
  const headers = {Origin: base, Cookie: cookie, "X-CSRF-Token": csrf,
    "Idempotency-Key": "claim-test", "X-Affiliate-Client-IP": "203.0.113.99",
    "X-Affiliate-Client-Signature": "forged", "X-Forwarded-For": "203.0.113.99"};
  const before = received.length;
  assert.equal((await fetch(base + "/api" + uri, {method:"POST", headers:{...headers,"X-CSRF-Token":"wrong"},body:raw})).status,403);
  assert.equal(received.length,before);
  assert.equal((await fetch(base + "/api" + uri, {method:"POST",headers,body:raw})).status,200);
  const sent=received.at(-1), h=sent.headers;
  assert.equal(h["x-affiliate-client-ip"],"127.0.0.1");
  assert.equal(h["x-forwarded-for"],undefined);
  const hash=(v)=>createHash("sha256").update(v).digest("hex");
  assert.equal(h["x-affiliate-body-sha256"],hash(raw));
  const parts=["affiliate-client-v1","tenant","app","member-real",hash("Bearer "+token),"POST",uri,"claim-test",h["x-affiliate-client-time"],"127.0.0.1",hash(raw)];
  assert.equal(h["x-affiliate-client-signature"],createHmac("sha256","k".repeat(32)).update(parts.join("\n")).digest("hex"));
  delete process.env.AFFILIATE_CLIENT_CONTEXT_KEY;
  assert.equal((await fetch(base + "/api" + uri,{method:"POST",headers,body:raw})).status,502);
  assert.equal(received.length,before+1);
});
test("错密码不能回退本地账号；无绑定拒绝并撤销孤立令牌", async () => {
  assert.equal((await login("wrong")).status, 401);
  assert.equal(legacyCalls, 0);
  trusted = false;
  assert.equal((await login("correct-password")).status, 401);
  assert.equal(revoked, true);
  trusted = true;
  revoked = false;
});
test("退出同时销毁BFF会话和来源令牌，原管理员方式仍可使用", async () => {
  let r = await fetch(base + "/auth/logout", {
    method: "POST",
    headers: { Origin: base, Cookie: cookie, "X-CSRF-Token": csrf },
    body: "{}",
  });
  assert.equal(r.status, 200);
  assert.equal(revoked, true);
  assert.equal(
    (
      await fetch(base + "/api/v1/me/commissions", {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
  process.env.WEB_OPERATOR_PASSWORD = "operator-test-password";
  r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({
      role: "operator",
      password: "operator-test-password",
    }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).role, "operator");
});
