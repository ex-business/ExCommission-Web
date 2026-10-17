import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:18181";
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "18181",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
  browser = await chromium.launch();
  const p = await browser.newPage();
  let state = "CLAIMABLE",
    claims = 0;
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/auth/session", (r) =>
    r.fulfill({
      json: {
        data: { role: "member", subject: "member-test", csrf: "test-csrf" },
      },
    }),
  );
  await p.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    assert.ok(url.pathname.startsWith("/api/v1/"));
    url.pathname = url.pathname.slice(4);
    if (req.method() === "POST") {
      assert.equal(url.pathname, "/v1/me/commission-orders/i1/claim");
      assert.deepEqual(req.postDataJSON(), { expected_revision: 1 });
      assert.ok(req.headers()["idempotency-key"]);
      assert.equal(req.headers()["x-csrf-token"], "test-csrf");
      claims++;
      state = "PROCESSING";
      return route.fulfill({
        status: 202,
        json: { data: { instruction_id: "i1", claim_status: "PROCESSING" } },
      });
    }
    if (url.pathname === "/v1/me/agent-rules")
      return route.fulfill({
        json: {
          data: {
            rows: [],
            agent_enabled: true,
            configured: true,
            is_agent: true,
          },
        },
      });
    if (url.pathname === "/v1/me/rewards")
      return route.fulfill({
        json: { data: { rows: [], next_after_id: null } },
      });
    if (url.pathname === "/v1/me/earnings")
      return route.fulfill({ json: { data: { rows: [] } } });
    if (url.pathname === "/v1/me/wallets")
      return route.fulfill({
        json: {
          data: {
            rows: [
              {
                currency: "USD",
                balance_minor: "5000",
                revision: 1,
                wallet_type: "REAL_MONEY",
              },
            ],
          },
        },
      });
    if (url.pathname.startsWith("/v1/me/wallet-"))
      return route.fulfill({
        json: {
          data: {
            rows: [
              {
                transaction_id: "t1",
                currency: "USD",
                amount_minor: "5000",
                balance_before_minor: "0",
                balance_after_minor: "5000",
                created_at: "2026-10-17T00:00:00Z",
              },
            ],
            next_after_id: null,
          },
        },
      });
    return route.fulfill({
      json: {
        data: {
          rows: [
            {
              statement_id: "s1",
              period: "2026-10-16",
              currency: "USD",
              total_minor: "10000",
              review_status: "APPROVED",
              orders: [
                {
                  instruction_id: "i1",
                  amount_minor: "5000",
                  revision: 1,
                  claim_status: state,
                },
              ],
            },
            {
              statement_id: "s2",
              period: "2026-10-17",
              currency: "USD",
              total_minor: "2000",
              review_status: "WAITING_REVIEW",
              orders: [],
            },
          ],
          next_after_id: null,
        },
      },
    });
  });
  await p.goto(base);
  await p.getByRole("button", { name: "我的收益", exact: true }).click();
  assert.equal(
    await p.getByRole("button", { name: "查询列表", exact: true }).count(),
    0,
  );
  await p.getByRole("button", { name: "刷新我的佣金" }).click();
  await p.getByText("待审核", { exact: true }).waitFor();
  await p.getByText("50.00 USD · 待领取", { exact: true }).waitFor();
  await p.getByRole("button", { name: "领取佣金", exact: true }).click();
  await p.getByText("50.00 USD · 领取处理中", { exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: "领取佣金", exact: true }).count(),
    0,
  );
  assert.equal(claims, 1);
  for (const [status, label] of [
    ["CLAIMED", "已领取"],
    ["FAILED", "领取失败"],
    ["CANCELLED", "取消派发"],
    ["RECONCILIATION_EXCEPTION", "核验异常"],
  ]) {
    state = status;
    await p.getByRole("button", { name: "刷新我的佣金" }).click();
    await p.getByText("50.00 USD · " + label, { exact: true }).waitFor();
    assert.equal(
      await p.getByRole("button", { name: "领取佣金", exact: true }).count(),
      0,
    );
  }
  await p.getByRole("button", { name: "查看真金钱包", exact: true }).click();
  await p.getByText("真金余额：50.00 USD", { exact: true }).waitFor();
  await p.getByRole("button", { name: "交易历史", exact: true }).click();
  await p.getByRole("region", { name: "交易历史" }).waitFor();
  await p.getByRole("button", { name: "账变记录", exact: true }).click();
  await p
    .getByRole("region", { name: "账变记录" })
    .getByText(/0.00 USD → 50.00 USD/)
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: member-only page, pending review, owner claim with CSRF/idempotency, processing suppresses repeated action, confirmed success/failure/cancellation/exception labels; mocked HTTP browser test",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
