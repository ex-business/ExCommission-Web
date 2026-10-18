import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/modules/affiliate/programRequest.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { programRequest } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("从已发布版本编辑时只发送申请白名单，审批元数据不回写", () => {
  const form = {
    program_id: "a",
    name: "方案A",
    expected_revision: 3,
    state: "STOPPED",
    effective_from: "2026-10-19T00:00:00Z",
    reason: "停用方案",
    match: { mode: "STACK" },
    config: { currency: "USD" },
    revision: 3,
    approval_id: "readonly",
    published_at: "readonly",
  };
  const input = programRequest(form);
  assert.deepEqual(
    Object.keys(input).sort(),
    [
      "program_id",
      "name",
      "expected_revision",
      "state",
      "effective_from",
      "reason",
      "match",
      "config",
    ].sort(),
  );
  assert.equal(input.expected_revision, 3);
  assert.equal(input.state, "STOPPED");
  assert.ok(!("approval_id" in input));
});
