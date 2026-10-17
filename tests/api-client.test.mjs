import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/lib/api.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { request } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("自定义业务页统一经过网关，既有代理路径与登录路径不重复改写", async () => {
  const old = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, opts) => {
    calls.push({ path, opts });
    return new Response(JSON.stringify({ data: { ok: true } }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    for (const path of [
      "/v1/me/commissions?limit=10",
      "/v1/affiliate/config",
      "/v1/agents/a/team",
      "/api/v1/plans",
      "/auth/session",
    ]) {
      await request(path, {
        method: "POST",
        body: { value: 1 },
        csrf: "csrf",
        key: "key",
        totp: "123456",
      });
    }
    assert.deepEqual(
      calls.map((x) => x.path),
      [
        "/api/v1/me/commissions?limit=10",
        "/api/v1/affiliate/config",
        "/api/v1/agents/a/team",
        "/api/v1/plans",
        "/auth/session",
      ],
    );
    for (const c of calls) {
      assert.equal(c.opts.headers["X-CSRF-Token"], "csrf");
      assert.equal(c.opts.headers["Idempotency-Key"], "key");
      assert.equal(c.opts.headers["X-TOTP-Code"], "123456");
      assert.equal(c.opts.body, '{"value":1}');
      assert.equal(c.opts.headers.Authorization, undefined);
    }
  } finally {
    globalThis.fetch = old;
  }
});
