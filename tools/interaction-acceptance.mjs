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
const b = await chromium.launch();
const p = await b.newPage();
const evidence = [];
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
async function select(title) {
  await p.getByLabel("搜索功能").fill(title);
  await p
    .locator(".search-results button")
    .filter({ hasText: new RegExp("/ " + title + "$") })
    .click();
}
async function submit() {
  await p.getByRole("button", { name: "核对并提交" }).click();
  await p.getByRole("button", { name: "确认提交", exact: true }).click();
  await p.locator(".request-id").waitFor();
}
try {
  await p.goto(base);
  await p.getByLabel("本地登录口令").fill(env.WEB_OPERATOR_PASSWORD);
  await p.getByRole("button", { name: "进入工作台 →" }).click();
  await p.getByLabel("搜索功能").waitFor();
  await p.getByRole("button", { name: /收益规则/ }).click();
  const union = p.getByLabel("收益规则 1配置类型", { exact: true });
  const choices = await union.locator("option").allTextContents();
  for (let i = 0; i < choices.length; i++) {
    await union.selectOption(String(i));
    await p.locator(".editor input").first().waitFor();
    evidence.push({ case: "规则结构切换 / " + choices[i], result: "PASS" });
  }
  assert.ok(choices.some((x) => x.includes("HIGHEST_RATE")));
  await p.getByRole("button", { name: "核对并提交" }).click();
  assert.equal(await p.getByRole("dialog").count(), 0);
  evidence.push({ case: "缺失字段不得进入提交核对", result: "PASS" });
  let submitted = [];
  let mode = "UNKNOWN";
  await p.route("**/api/v1/payments", async (route) => {
    submitted.push({
      body: route.request().postDataJSON(),
      key: route.request().headers()["idempotency-key"],
    });
    await route.fulfill({
      status: mode === "CONFLICT" ? 409 : 200,
      contentType: "application/json",
      headers: { "X-Request-ID": "fixture-request" },
      body: JSON.stringify(
        mode === "CONFLICT"
          ? {
              error: {
                code: "REVISION_CONFLICT",
                message: "预期修订已过时",
                retryable: false,
              },
              request_id: "fixture-request",
            }
          : {
              data: {
                payment_id: "fixture-payment",
                merchant_payment_id: "fixture-original-id",
                status: "UNKNOWN",
                amount: submitted.at(-1).body.amount,
              },
            },
      ),
    });
  });
  async function paymentForm() {
    await select("创建沙箱付款");
    await p.getByLabel("结算单编号", { exact: true }).fill("fixture-statement");
    await p.getByLabel("币种", { exact: true }).fill("BTC");
    await p
      .getByLabel("金额（币种最小单位）", { exact: true })
      .fill("900719925474099312345678");
  }
  await paymentForm();
  await submit();
  assert.equal(
    submitted.at(-1).body.amount.minor_units,
    "900719925474099312345678",
  );
  assert.ok(
    (await p.locator(".result-panel").innerText()).includes("结果未知"),
  );
  const key = submitted.at(-1).key;
  await submit();
  assert.equal(submitted.at(-1).key, key);
  evidence.push({
    case: "桩协议 / 超大金额字符串无精度损失 / UNKNOWN不冒充成功",
    result: "PASS",
  });
  await p.reload();
  await paymentForm();
  await submit();
  assert.equal(submitted.at(-1).key, key);
  const storage = await p.evaluate(() => JSON.stringify(sessionStorage));
  assert.ok(!storage.includes("900719925474099312345678"));
  assert.ok(!storage.includes("fixture-statement"));
  evidence.push({
    case: "桩协议 / 刷新后原输入沿用原幂等键 / 仅存摘要不存载荷",
    result: "PASS",
  });
  mode = "CONFLICT";
  await submit();
  assert.ok(
    (await p.locator(".error-box").innerText()).includes("REVISION_CONFLICT"),
  );
  assert.ok(
    !(await p.locator(".result-panel").innerText()).includes(
      "fixture-original-id",
    ),
  );
  evidence.push({
    case: "桩协议 / 修订冲突如实展示并清除旧结果",
    result: "PASS",
  });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("docs/interaction-acceptance.json", root),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        mode: "浏览器桩协议，付款请求被拦截，不发送后端",
        cases: evidence,
      },
      null,
      2,
    ),
  );
  console.log("PASS " + evidence.length + " 项交互验收；未发送付款。");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await b.close();
}
