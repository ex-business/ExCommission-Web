import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:18183",
  child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "18183",
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
  let submitted;
  await p.route("**/auth/session", (r) =>
    r.fulfill({
      json: {
        data: { role: "operator", subject: "local-operator", csrf: "csrf" },
      },
    }),
  );
  await p.route("**/v1/**", (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    let data;
    if (req.method() === "POST") {
      submitted = req.postDataJSON();
      assert.ok(req.headers()["idempotency-key"]);
      data = { approval_id: "site-approval", object_hash: "hash", revision: 0 };
    } else if (path === "/v1/site-agent-config") {
      data = {
        configured: true,
        enabled: false,
        plan_id: "P1",
        venue_ids: [],
        revision: 3,
        effective_from: null,
      };
    } else if (path === "/v1/site-agent-options") {
      data = {
        rows: [
          {
            plan_id: "P1",
            venue_id: "A",
            version_id: "v1",
            event_type: "FEE_CONFIRMED",
            scene: "S",
          },
          {
            plan_id: "P1",
            venue_id: "B",
            version_id: "v1",
            event_type: "FEE_CONFIRMED",
            scene: "S",
          },
        ],
      };
    } else throw Error(path);
    return r.fulfill({ json: { data } });
  });
  await p.goto(base);
  await p.getByRole("button", { name: /系统管理/ }).click();
  await p.getByRole("button", { name: "站点代理", exact: true }).click();
  await p.getByRole("button", { name: "读取站点配置" }).click();
  await p.getByLabel("启用站点代理").check();
  await p.getByLabel("场馆 A", { exact: true }).check();
  await p.getByLabel("站点配置变更原因").fill("开通代理");
  await p.getByRole("button", { name: "提交站点配置审批" }).click();
  await p.getByText(/已提交审批：site-approval/).waitFor();
  assert.equal(submitted.expected_revision, 3);
  assert.equal(submitted.enabled, true);
  assert.deepEqual(submitted.venue_ids, ["A"]);
  await p.getByText(/当前状态：已关闭/).waitFor();
  console.log(
    "PASS: site configuration loads published choices, venue selection and switch submit independent approval without pretending applied; mocked HTTP",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
