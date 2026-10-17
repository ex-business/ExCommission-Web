import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../server/index.mjs";
const received = [];
const upstream = http.createServer((req, res) => {
  received.push(req);
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      data: {
        visible: true,
        currency: "USD",
        currency_scale: 2,
        invitee_reward_minor: "50",
        maximum_reward_minor: "300",
        maximum_rate_ppm: 4000,
        secret: "hidden",
        social: [{ platform: "TELEGRAM", enabled: true, secret: "hidden" }],
        feed: {
          totals: { USD: "500" },
          rows: [
            {
              member: "1234****5678",
              kind: "REFERRAL",
              amount_minor: "100",
              currency: "USD",
              claimed_at: "2026-10-17T01:00:00Z",
              claim_ip: "private",
            },
          ],
        },
      },
    }),
  );
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
process.env.BACKEND_URL = "http://127.0.0.1:" + upstream.address().port;
process.env.LOCAL_OPERATOR_TOKEN = "fixed-site-token";
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
test.after(() => {
  server.close();
  upstream.close();
});
test("匿名代理展示固定站点并严格剔除非公开字段", async () => {
  const r = await fetch(base + "/affiliate-public", {
    headers: { Authorization: "Bearer forged", "X-Tenant-ID": "other" },
  });
  assert.equal(r.status, 200);
  const result = await r.text();
  assert.ok(!result.includes("hidden"));
  assert.ok(!result.includes("claim_ip"));
  assert.ok(!result.includes("fixed-site-token"));
  assert.equal(received.at(-1).url, "/v1/affiliate/public-presentation");
  assert.equal(
    received.at(-1).headers.authorization,
    "Bearer fixed-site-token",
  );
  assert.equal(received.at(-1).headers["x-tenant-id"], undefined);
});
test("匿名展示不接受站点参数或写入且原业务继续要求登录", async () => {
  assert.equal(
    (await fetch(base + "/affiliate-public?tenant=other")).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/affiliate-public", {
        method: "POST",
        headers: { Origin: base },
      })
    ).status,
    405,
  );
  assert.equal((await fetch(base + "/api/v1/affiliate/config")).status, 401);
});
