import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  base = "http://127.0.0.1:18180";
const env = Object.fromEntries(
  (await readFile(new URL(".env", root), "utf8"))
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const evidence = [];
const health = await fetch(base + "/healthz");
assert.equal(health.status, 200);
evidence.push({ case: "容器HTTP健康", result: "PASS" });
assert.equal((await fetch(base + "/api/v1/platform/catalogs")).status, 401);
evidence.push({ case: "容器匿名请求隔离", result: "PASS" });
const b = await chromium.launch(),
  p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto(base);
  await p.getByLabel("本地登录口令").fill(env.WEB_OPERATOR_PASSWORD);
  await p.getByRole("button", { name: "进入工作台 →" }).click();
  await p.getByLabel("搜索功能").fill("当前目录");
  await p.locator(".search-results button").click();
  await p.getByRole("button", { name: "查询", exact: true }).click();
  await p.locator(".request-id").waitFor();
  assert.equal(await p.locator(".error-box").count(), 0);
  assert.ok((await p.locator(".result-panel").innerText()).includes("UTC-v1"));
  evidence.push({ case: "容器浏览器登录与Go后端目录联通", result: "PASS" });
  const cookies = await p.context().cookies();
  assert.ok(
    cookies.find(
      (c) => c.name === "ec_session" && c.httpOnly && c.sameSite === "Strict",
    ),
  );
  await p.reload();
  await p.getByLabel("搜索功能").waitFor();
  evidence.push({ case: "容器会话刷新与HttpOnly Cookie", result: "PASS" });
  assert.deepEqual(errors, []);
  evidence.push({ case: "生产构建脚本与严格CSP兼容", result: "PASS" });
  await writeFile(
    new URL("docs/container-acceptance.json", root),
    JSON.stringify(
      { time: new Date().toISOString(), base, cases: evidence },
      null,
      2,
    ),
  );
  console.log("PASS " + evidence.length + " 项容器验收。");
} finally {
  await b.close();
}
