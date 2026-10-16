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
  assert.ok(ready, "test server");
  browser = await chromium.launch();
  const p = await browser.newPage();
  const calls = [];
  let reviewed = false;
  let orders = [];
  const review = {
    approval_id: "a1",
    applicant_id: "maker",
    approval_status: "PENDING",
    execution_status: "PENDING",
    object_hash: "hash",
    revision: 0,
    statement_id: "s1",
    statement_revision: 1,
    statement_status: "APPROVED",
    agent_id: "agent",
    currency: "USD",
    period: "2026-10-16",
    total_minor: "10000",
    remark: "",
  };
  await p.route("**/auth/session", (r) =>
    r.fulfill({
      json: {
        data: { role: "operator", subject: "operator", csrf: "test-csrf" },
      },
    }),
  );
  await p.route("**/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      method = req.method();
    const body = method === "GET" ? null : req.postDataJSON();
    let data;
    if (method !== "GET")
      calls.push({
        path: u.pathname,
        method,
        body,
        key: req.headers()["idempotency-key"],
      });
    if (u.pathname === "/v1/commission-reviews") {
      data = {
        rows:
          u.searchParams.get("approval_status") === "APPROVED"
            ? [{ ...review, approval_status: "APPROVED" }]
            : reviewed
              ? []
              : [review, { ...review, approval_id: "a2" }],
        next_after_id: null,
      };
    } else if (u.pathname === "/v1/commission-review-batches") {
      reviewed = true;
      data = {
        batch_id: "b1",
        results: body.items.map((x, i) => ({
          resource_id: x.approval_id,
          http_status: i ? 403 : 200,
          response: i
            ? { error: { code: "SELF_APPROVAL_FORBIDDEN" } }
            : {
                data: {
                  approval_status: "APPROVED",
                  execution_status: "SUCCEEDED",
                },
              },
        })),
      };
    } else if (u.pathname === "/v1/payout-orders" && method === "GET") {
      data = { rows: orders, next_after_id: null };
    } else if (u.pathname === "/v1/payout-orders" && method === "POST") {
      data = {
        ...body,
        instruction_id: "i" + (orders.length + 1),
        status: "DRAFT",
        revision: 0,
        payment_id: null,
        error_code: null,
        created_at: "2026-10-17T00:00:00Z",
      };
      orders.push(data);
    } else if (
      u.pathname.startsWith("/v1/payout-orders/") &&
      method === "PUT"
    ) {
      const i = orders.find(
        (x) => x.instruction_id === u.pathname.split("/").pop(),
      );
      assert.equal(body.expected_revision, i.revision);
      Object.assign(i, {
        amount: body.amount,
        remark: body.remark,
        revision: i.revision + 1,
      });
      data = i;
    } else if (u.pathname === "/v1/payout-order-batches") {
      data = {
        batch_id: "p1",
        results: body.items.map((x) => {
          const i = orders.find((o) => o.instruction_id === x.instruction_id);
          assert.equal(x.expected_revision, i.revision);
          Object.assign(i, {
            status: body.action === "CANCEL" ? "CANCELLED" : "QUEUED",
            revision: i.revision + 1,
          });
          return {
            resource_id: i.instruction_id,
            http_status: 200,
            response: { data: i },
          };
        }),
      };
    } else throw Error("Unexpected route " + method + " " + u.pathname);
    await route.fulfill({ json: { data } });
  });
  await p.goto(base);
  await p.getByRole("button", { name: /结算与审核/ }).click();
  await p.getByRole("button", { name: "查询列表", exact: true }).click();
  await p.getByLabel("选择 a1", { exact: true }).check();
  await p.getByLabel("选择 a2", { exact: true }).check();
  await p.getByLabel("批量备注").fill("逐项审核备注");
  await p.getByRole("button", { name: "批量审核通过", exact: true }).click();
  await p.getByText(/a2：SELF_APPROVAL_FORBIDDEN/).waitFor();
  assert.equal(calls[0].body.items[0].remark, "逐项审核备注");
  await p.getByLabel("审核状态").selectOption("APPROVED");
  await p.getByRole("button", { name: "查询列表", exact: true }).click();
  await p.getByRole("button", { name: "准备派发", exact: true }).click();
  await p.getByLabel("本次派发金额").fill("1.001");
  await p.getByRole("button", { name: "保存草稿", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "金额小数位超出" }).waitFor();
  await p.getByLabel("本次派发金额").fill("49.99");
  await p.getByLabel("派发备注").fill("<img src=x>派发备注");
  await p.getByRole("button", { name: "保存草稿", exact: true }).click();
  await p.getByLabel("选择 i1", { exact: true }).waitFor();
  assert.equal(orders[0].amount.minor_units, "4999");
  assert.equal(await p.locator(".review-workspace img").count(), 0);
  await p.getByRole("button", { name: "调整金额与备注", exact: true }).click();
  await p.getByLabel("本次派发金额").fill("60.00");
  await p.getByRole("button", { name: "保存草稿", exact: true }).click();
  await p.getByLabel("选择 i1", { exact: true }).waitFor();
  assert.equal(orders[0].amount.minor_units, "6000");
  await p.getByRole("button", { name: "取消草稿", exact: true }).click();
  await p
    .locator(".review-table")
    .getByText("已取消", { exact: true })
    .waitFor();
  assert.equal(orders[0].status, "CANCELLED");
  await p
    .locator(".review-workspace")
    .getByRole("button", { name: "佣金审核", exact: true })
    .click();
  await p.getByRole("button", { name: "查询列表", exact: true }).click();
  await p.getByRole("button", { name: "准备派发", exact: true }).click();
  await p.getByLabel("派发方式").selectOption("DIRECT");
 await p.getByLabel("本次派发金额").fill("30.00");
  await p.getByRole("button", { name: "保存草稿", exact: true }).click();
  await p.getByLabel("选择 i2", { exact: true }).check();
  await p.getByRole("button", { name: "批量提交派发", exact: true }).click();
  await p
    .locator(".review-table")
    .getByText("待派发", { exact: true })
    .waitFor();
  assert.equal(orders[1].amount.minor_units, "3000");
  assert.ok(calls.every((x) => x.key));
  console.log(
    "PASS: actual browser filters, mixed batch results, remarks, exact currency conversion, draft edit/cancel and batch release; mock transport only, backend MySQL lifecycle tested separately",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
