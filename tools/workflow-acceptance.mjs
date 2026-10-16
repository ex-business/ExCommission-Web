import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  base = process.env.WEB_TEST_URL || "http://127.0.0.1:18180";
const env = Object.fromEntries(
  (await readFile(new URL(".env", root), "utf8"))
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const prior = JSON.parse(
  await readFile(new URL("docs/browser-acceptance.json", root), "utf8"),
);
const plan = prior.cases.find((x) => x.resource).resource;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const evidence = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function select(title) {
  await page.getByLabel("搜索功能", { exact: true }).fill(title);
  await page
    .locator(".search-results button")
    .filter({ hasText: new RegExp("/ " + title + "$") })
    .click();
}
async function login(role) {
  await page.goto(base);
  await page.getByLabel("登录身份").selectOption(role);
  await page
    .getByLabel("本地登录口令")
    .fill(env["WEB_" + role.toUpperCase() + "_PASSWORD"]);
  await page.getByRole("button", { name: "进入工作台 →" }).click();
  await page.getByLabel("搜索功能").waitFor();
}
async function query() {
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
}
async function submit() {
  await page.getByRole("button", { name: "核对并提交" }).click();
  await page.getByRole("dialog").waitFor();
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/") && r.request().method() !== "GET",
  );
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  return await response;
}
try {
  await login("operator");
  await select("读取草稿");
  await page.getByLabel("资源编号", { exact: true }).fill(plan);
  await query();
  await page.getByRole("button", { name: "修订草稿 →", exact: true }).click();
  assert.equal(
    await page.getByLabel("方案编号", { exact: true }).inputValue(),
    plan,
  );
  await page.getByRole("button", { name: "核对并提交" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "返回修改" }).click();
  evidence.push({
    case: "草稿读取后修订字段白名单 / 不提交冗余响应字段",
    result: "PASS",
  });
  await select("读取草稿");
  await page.getByLabel("资源编号", { exact: true }).fill(plan);
  await query();
  await page.getByRole("button", { name: "试算验证 →", exact: true }).click();
  for (const title of [
    "计佣基数（主单位）",
    "基数币种",
    "产品代码",
    "场景",
    "已确认",
    "业务发生时间（UTC）",
  ])
    await page.getByLabel("填写" + title, { exact: true }).check();
  await page.getByLabel("计佣基数（主单位）", { exact: true }).fill("1000");
  await page.getByLabel("基数币种", { exact: true }).fill("USD");
  await page.getByLabel("产品代码", { exact: true }).fill(plan);
  await page.getByLabel("场景", { exact: true }).fill("WEB_ACCEPTANCE");
  await page.getByLabel("已确认", { exact: true }).check();
  await page
    .getByLabel("业务发生时间（UTC）", { exact: true })
    .fill(new Date(Date.now() + 7200000).toISOString());
  let response = await submit();
  let data = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(data));
  assert.ok(data.data.simulation_id);
  evidence.push({
    case: "当前草稿摘要衔接真实试算 / 无祖先零收益",
    result: "PASS",
  });
  // 相同输入重试必须保持幂等键，不能另造试算。
  const firstKey = response.request().headers()["idempotency-key"];
  response = await submit();
  data = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(response.request().headers()["idempotency-key"], firstKey);
  evidence.push({ case: "同一页面原输入重试保持原幂等键", result: "PASS" });
  await page.getByRole("button", { name: "申请发布 →", exact: true }).click();
  await page.getByLabel("资源编号", { exact: true }).fill(plan);
  await page.getByLabel("预期修订号", { exact: true }).fill("0");
  await page
    .getByLabel("生效时间（UTC）", { exact: true })
    .fill(new Date(Date.now() + 3600000).toISOString());
  await page
    .getByLabel("业务原因", { exact: true })
    .fill("前端验收：只验证申请与独立驳回，不发布");
  response = await submit();
  data = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(data));
  const approval = data.data.approval_id;
  assert.ok(approval);
  evidence.push({ case: "当前试算证明申请发布 / 仅待审批", result: "PASS" });
  await page
    .locator(".next-actions button")
    .filter({ hasText: "审批详情 ·" })
    .click();
  await query();
  await page.getByRole("button", { name: "审批决定 →", exact: true }).click();
  await page
    .getByLabel("业务原因", { exact: true })
    .fill("同一申请人自审应拒绝");
  response = await submit();
  data = await response.json();
  assert.equal(response.status(), 403);
  assert.ok(
    (await page.locator(".error-box").innerText()).includes(
      "PERMISSION_DENIED",
    ),
  );
  evidence.push({
    case: "真实后端拒绝申请人自审 / 前端如实展示403",
    result: "PASS",
  });
  await page.getByRole("button", { name: "退出 / 切换身份" }).click();
  await page.getByLabel("登录身份").selectOption("approver");
  await page.getByLabel("本地登录口令").fill(env.WEB_APPROVER_PASSWORD);
  await page.getByRole("button", { name: "进入工作台 →" }).click();
  await page.getByLabel("搜索功能").waitFor();
  await select("审批详情");
  await page.getByLabel("资源编号", { exact: true }).fill(approval);
  await query();
  await page.getByRole("button", { name: "审批决定 →", exact: true }).click();
  await page.getByLabel("决定", { exact: true }).selectOption("REJECT");
  await page
    .getByLabel("业务原因", { exact: true })
    .fill("独立验收完成，驳回测试发布，保持无生效版本");
  response = await submit();
  data = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(data));
  assert.equal(data.data.approval_status, "REJECTED");
  evidence.push({ case: "独立主体真实驳回 / 保持未发布", result: "PASS" });
  await select("版本列表");
  await page.getByLabel("资源编号", { exact: true }).fill(plan);
  await query();
  assert.equal(await page.locator(".result-panel tbody tr").count(), 0);
  evidence.push({ case: "版本列表确认测试方案未发布", result: "PASS" });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("docs/workflow-acceptance.json", root),
    JSON.stringify(
      { time: new Date().toISOString(), plan, approval, cases: evidence },
      null,
      2,
    ),
  );
  console.log(
    "PASS " + evidence.length + " 项流程与失败边界验收；测试发布已驳回。",
  );
} catch (e) {
  await writeFile(
    new URL("docs/workflow-progress.json", root),
    JSON.stringify(
      { time: new Date().toISOString(), cases: evidence, error: String(e) },
      null,
      2,
    ),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
