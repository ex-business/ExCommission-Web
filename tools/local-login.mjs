// 交互式读取本地口令并复制到剪贴板，不向终端打印。
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const role = process.argv[2];
if (!["operator", "approver"].includes(role))
  throw new Error("用法：node tools/local-login.mjs operator 或 approver");
const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const child = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "inherit"] });
child.stdin.end(env["WEB_" + role.toUpperCase() + "_PASSWORD"]);
child.on("exit", (code) => {
  if (code === 0)
    console.log("对应本地登录口令已复制到剪贴板，请粘贴到登录页面。");
  else process.exitCode = 1;
});
