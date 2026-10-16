import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:18181",
  child = spawn(
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
  const p = await browser.newPage(),
    calls = [];
  await p.route("**/auth/session", (r) =>
    r.fulfill({
      json: { data: { role: "operator", subject: "operator", csrf: "csrf" } },
    }),
  );
  await p.route("**/v1/**", async (r) => {
    const u = new URL(r.request().url());
    calls.push(u);
    return r.fulfill({
      json: {
        data: {
          rows: [
            {
              user_id: "u1",
              agent_id: "a1",
              display_name: "一级代理",
              depth: 1,
              status: "ACTIVE",
              statistics: {
                deposit_minor: "12345",
                withdrawal_minor: "300",
                bet_minor: "50000",
                valid_bet_minor: "40000",
                vip: "VIP3",
                login_ip: "192.0.2.1",
              },
            },
          ],
          summary: {
            members: 51,
            missing_statistics: 1,
            complete: false,
            deposit_minor: "100000",
            withdrawal_minor: "1000",
            bet_minor: "500000",
            valid_bet_minor: "400000",
          },
          next_after_id: u.searchParams.has("after_id") ? null : "u1",
          as_of: "2026-10-17T00:00:00Z",
        },
      },
    });
  });
  await p.goto(base);
  await p.getByRole("button", { name: /代理管理/ }).click();
  await p.getByRole("button", { name: "代理目录", exact: true }).click();
  await p.getByLabel("下线所属代理").fill("root");
  await p.getByLabel("下线层级").selectOption("2");
  await p.getByRole("button", { name: "查询代理与团队" }).click();
  await p.getByText("123.45 USD", { exact: true }).waitFor();
  await p.getByText("VIP3", { exact: true }).waitFor();
  assert.equal(calls.at(-1).pathname, "/v1/agents/root/team");
  assert.equal(calls.at(-1).searchParams.get("depth"), "2");
  await p.getByRole("button", { name: "下一页团队" }).click();
  await p.waitForTimeout(100);
  assert.equal(calls.at(-1).searchParams.get("as_of"), "2026-10-17T00:00:00Z");
  console.log(
    "PASS: directory root/depth/currency query, exact amounts/VIP/IP, full-scope summary and stable page timestamp; mocked HTTP",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
