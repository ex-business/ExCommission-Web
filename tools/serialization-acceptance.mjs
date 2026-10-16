import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import Ajv from "ajv";
import addFormats from "ajv-formats";
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
const spec = JSON.parse(
  await readFile(new URL("contracts/openapi.json", root), "utf8"),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "spec", components: spec.components });
function refs(x) {
  if (Array.isArray(x)) return x.map(refs);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [
        k,
        k === "$ref" && typeof v === "string" ? "spec" + v : refs(v),
      ]),
    );
  return x;
}
const ops = [];
for (const g of ["plans", "users", "agents", "finance", "reports", "system"]) {
  const text = await readFile(
    new URL("src/modules/" + g + "/operations.ts", root),
    "utf8",
  );
  ops.push(
    ...JSON.parse(
      text
        .slice(text.indexOf("=") + 1)
        .trim()
        .replace(/;$/, "")
        .replace(/,\s*([\]}])/g, "$1"),
    ),
  );
}
const b = await chromium.launch(),
  p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
let current, seen;
const evidence = [];
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.route("**/api/v1/**", async (route) => {
  const req = route.request(),
    [group, section, title, method, path] = current;
  assert.equal(req.method(), method);
  assert.ok(
    new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(
      new URL(req.url()).pathname.slice(4),
    ),
    title + " path",
  );
  const op = spec.paths[path][method.toLowerCase()];
  const schema = op.requestBody?.content?.["application/json"]?.schema;
  if (schema) {
    const valid = ajv.compile(refs(schema));
    const data = req.postDataJSON();
    assert.ok(valid(data), title + " " + JSON.stringify(valid.errors));
    assert.ok(req.headers()["idempotency-key"]);
  } else assert.equal(req.postData(), null);
  seen = true;
  await route.fulfill({
    status: 200,
    contentType: title === "下载快照" ? "text/csv" : "application/json",
    headers: { "X-Request-ID": "fixture-request" },
    body:
      title === "下载快照"
        ? "currency,amount\nUSD,0\n"
        : JSON.stringify({
            data: { status: "FIXTURE_ACCEPTED", operation: title },
          }),
  });
});
async function fill() {
  const fields = p.locator(".editor input");
  for (let i = 0; i < (await fields.count()); i++) {
    const input = fields.nth(i),
      type = await input.getAttribute("type");
    if (
      ["checkbox", "number"].includes(type) ||
      (await input.getAttribute("readonly")) !== null ||
      !(await input.isVisible()) ||
      (await input.inputValue())
    )
      continue;
    const name = (await input.getAttribute("aria-label")) || "";
    let value = "qa";
    if (/UTC/.test(name)) value = "2026-10-16T00:00:00Z";
    else if (
      /金额|基数|费率|上限|数量|权重|单价|比较值|奖池|预算|奖励|最低付款/.test(
        name,
      )
    )
      value = "1";
    else if (/币种/.test(name)) value = "USD";
    else if (/单位/.test(name)) value = "COUNT";
    await input.fill(value);
  }
}
try {
  await p.goto(base);
  await p.getByLabel("登录密码").fill(env.WEB_OPERATOR_PASSWORD);
  await p.getByRole("button", { name: "登录" }).click();
  for (current of ops.slice(Number(process.env.WEB_TEST_START || 0))) {
    const [, , title, method] = current;
    seen = false;
    await p.getByLabel("搜索功能").fill(title);
    await p
      .locator(".search-results button")
      .filter({ hasText: new RegExp("/ " + title + "$") })
      .click();
    if (["创建方案", "修订草稿"].includes(title)) {
      for (const name of ["基础与路由", "参与与等级", "收益规则", "结算策略"]) {
        await p.getByRole("button", { name: new RegExp(name) }).click();
        await fill();
      }
    } else await fill();
    if (method === "GET") {
      const name = title === "下载快照" ? "查询并下载" : "查询";
      await p.getByRole("button", { name, exact: true }).click();
    } else {
      await p.getByRole("button", { name: "核对并提交" }).click();
      await p.getByRole("dialog").waitFor({ timeout: 3000 });
      await p.getByRole("button", { name: "确认提交", exact: true }).click();
    }
    await p.locator(".request-id").waitFor({ timeout: 3000 });
    assert.ok(seen, title + " not sent");
    assert.equal(await p.locator(".error-box").count(), 0, title);
    evidence.push({
      case: title,
      method: current[3],
      path: current[4],
      result: "PASS",
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("docs/serialization-acceptance.json", root),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        mode: "58项浏览器请求序列化及OpenAPI输入校验；全部拦截，不发送后端；不代表58项领域集成验收",
        cases: evidence,
      },
      null,
      2,
    ),
  );
  console.log("PASS " + evidence.length + " 项操作请求序列化与契约校验。");
} catch (e) {
  console.error("操作：" + current?.[2], e);
  console.error(await p.locator(".error-box").allTextContents());
  console.error(
    await p.locator(".editor input:invalid").evaluateAll((xs) =>
      xs.map((x) => ({
        name: x.getAttribute("aria-label"),
        value: x.value,
        reason: x.validationMessage,
      })),
    ),
  );
  await writeFile(
    new URL("docs/serialization-progress.json", root),
    JSON.stringify({ cases: evidence, error: String(e) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await b.close();
}
