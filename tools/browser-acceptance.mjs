import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
const root = new URL("../", import.meta.url);
const env = Object.fromEntries(
  (await readFile(new URL(".env", root), "utf8"))
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.WEB_TEST_URL || "http://127.0.0.1:18180";
const output = new URL("../outputs/", root);
await mkdir(output, { recursive: true });
const evidence = [];
async function select(title) {
  await page.getByLabel("搜索功能", { exact: true }).fill(title);
  await page
    .locator(".search-results button")
    .filter({ hasText: new RegExp("/ " + title + "$") })
    .click();
  await page.locator(".editor h2").filter({ hasText: title }).waitFor();
}
async function login(role = "operator") {
  await page.goto(base);
  await page.getByLabel("登录身份").selectOption(role);
  await page
    .getByLabel("本地登录口令")
    .fill(env["WEB_" + role.toUpperCase() + "_PASSWORD"]);
  await page.getByRole("button", { name: "进入工作台 →" }).click();
  await page.getByLabel("搜索功能").waitFor();
}
try {
  await login();
  evidence.push({ case: "本地申请身份登录", result: "PASS" });
  const definitions = [];
  for (const g of [
    "plans",
    "users",
    "agents",
    "finance",
    "reports",
    "system",
  ]) {
    const text = await readFile(
      new URL("src/modules/" + g + "/operations.ts", root),
      "utf8",
    );
    definitions.push(
      ...JSON.parse(
        text
          .slice(text.indexOf("=") + 1)
          .trim()
          .replace(/;$/, "").replace(/,\s*([\]}])/g,"$1"),
      ),
    );
  }
  if(!process.env.WEB_TEST_SKIP_BASELINE){
  for (const [group, section, title] of definitions) {
    await select(title);
    assert.equal(await page.locator(".editor h2").innerText(), title);
    assert.equal(
      await page
        .locator("body")
        .innerText()
        .then((t) => t.includes("undefined")),
      false,
      "undefined on " + title,
    );
    evidence.push({
      case: "操作页面 / " + group + " / " + title,
      result: "PASS",
    });
  }
  // 实际只读接口，不修改现有业务数据。
  for (const title of ["当前目录", "组件与连接", "本地通知", "审计日志"]) {
    await select(title);
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await page.locator(".request-id").waitFor();
    assert.equal(await page.locator(".error-box").count(), 0, title);
    evidence.push({ case: "真实后端查询 / " + title, result: "PASS" });
  }
  await select("查询报表");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
  await page.screenshot({
    path: fileURLToPath(new URL("报表页面.png", output)),
    fullPage: true,
  });
  evidence.push({ case: "真实报表与不可用指标说明", result: "PASS" });
  await select("审批决定");
  await page.getByLabel("资源编号", { exact: true }).fill("missing-approval");
  await page.getByLabel("审批对象摘要", { exact: true }).fill("missing-hash");
  await page
    .getByLabel("业务原因", { exact: true })
    .fill("页面验收：不存在资源必须明确失败");
  await page.getByRole("button", { name: "核对并提交" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  evidence.push({ case: "写操作提交前核对与取消", result: "PASS" });
  }
  // 合同验收：仅新增一个唯一编号的沙箱草稿，不修改既有对象或账务。
  const plan = "web-qa-" + Date.now();
  await select("创建方案");
  await page.getByLabel("方案编号", { exact: true }).fill(plan);
  await page.getByLabel("名称", { exact: true }).fill("前端独立验收方案");
  await page.getByLabel("产品代码", { exact: true }).fill(plan);
  await page.getByLabel("场景", { exact: true }).fill("WEB_ACCEPTANCE");
  await page.getByRole("button", { name: /参与与等级/ }).click();
  await page.getByLabel("物理层数上限", { exact: true }).fill("3");
  await page.getByRole("button", { name: /收益规则/ }).click();
  await page.screenshot({
    path: fileURLToPath(new URL("方案配置页面.png", output)),
    fullPage: true,
  });
  await page.getByRole("button", { name: /结算策略/ }).click();
  await page.getByRole("button", { name: "核对并提交" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(
    await page.locator(".error-box").count(),
    0,
    await page
      .locator(".error-box")
      .allTextContents()
      .then((x) => x.join("")),
  );
  evidence.push({
    case: "真实创建方案 / 四步表单 / 服务端校验",
    result: "PASS",
    resource: plan,
  });
  await page.getByRole("button", { name: "读取草稿 →", exact: true }).click();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
  assert.ok((await page.locator(".result-panel").innerText()).includes(plan));
  evidence.push({ case: "资源衔接 / 创建后查询真实草稿", result: "PASS" });
  await select("创建导出");
  await page.getByRole("button", { name: "核对并提交" }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
  const link = page
    .locator(".next-actions button")
    .filter({ hasText: "导出详情 ·" })
    .first();
  await link.click();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
  await page.getByRole("button", { name: "下载快照 →", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "查询并下载", exact: true }).click();
  const download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith(".csv"));
  evidence.push({ case: "真实报表快照 / 查询 / 鉴权下载", result: "PASS" });
  await page.getByRole("button", { name: "退出 / 切换身份" }).click();
  await page.getByLabel("登录身份").selectOption("approver");
  await page.getByLabel("本地登录口令").fill(env.WEB_APPROVER_PASSWORD);
  await page.getByRole("button", { name: "进入工作台 →" }).click();
  await page.getByLabel("搜索功能").waitFor();
  await select("当前目录");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.locator(".request-id").waitFor();
  assert.equal(await page.locator(".error-box").count(), 0);
  evidence.push({ case: "独立审批身份登录与授权查询", result: "PASS" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("移动页面.png", output)),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  evidence.push({ case: "390px 移动布局无横向溢出", result: "PASS" });
  assert.deepEqual(errors, []);
  evidence.push({ case: "全部页面无运行异常", result: "PASS" });
  await writeFile(
    new URL("docs/browser-acceptance.json", root),
    JSON.stringify(
      { time: new Date().toISOString(), base, cases: evidence },
      null,
      2,
    ),
  );
  console.log(
    "PASS " +
      evidence.length +
      " 项页面验收；独立草稿 " +
      plan +
      "；未发布、未付款。",
  );
} catch (e) {
  await page.screenshot({
    path: fileURLToPath(new URL("验收故障定位.png", output)),
    fullPage: true,
  });
  await writeFile(new URL("docs/browser-progress.json",root),JSON.stringify({time:new Date().toISOString(),cases:evidence,error:String(e)},null,2));
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
