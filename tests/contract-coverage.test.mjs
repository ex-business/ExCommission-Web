import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("V1全部操作有管理入口或明确的渠道专用边界", async () => {
  const spec = JSON.parse(
    await readFile(
      new URL("../contracts/openapi.json", import.meta.url),
      "utf8",
    ),
  );
  const actual = [];
  for (const g of [
    "plans",
    "users",
    "agents",
    "finance",
    "reports",
    "system",
  ]) {
    const text = await readFile(
      new URL("../src/modules/" + g + "/operations.ts", import.meta.url),
      "utf8",
    );
    for (const op of JSON.parse(
      text
        .slice(text.indexOf("=") + 1)
        .trim()
        .replace(/;$/, "")
        .replace(/,\s*([\]}])/g, "$1"),
    ))
      actual.push(op[3] + " " + op[4]);
  }
  assert.equal(actual.length, 58);
  assert.equal(new Set(actual).size, 58);
  const expected = Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.keys(ops).map((m) => m.toUpperCase() + " " + path),
  );
  assert.equal(expected.length, 59);
  assert.deepEqual(
    expected.filter((x) => !actual.includes(x)),
    ["POST /v1/payment-callbacks/{channel_id}"],
  );
  assert.ok(actual.every((x) => expected.includes(x)));
});
