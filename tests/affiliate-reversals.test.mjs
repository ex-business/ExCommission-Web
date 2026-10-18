import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handleProxy } from "../server/proxy.mjs";
test("冲正只读查询可转发，所有浏览器身份均不可提交来源冲正", async () => {
  let forwarded = 0;
  const upstream = http.createServer((req, res) => {
    forwarded++;
    res.setHeader("Content-Type", "application/json");
    res.end('{"data":{"items":[]}}');
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  process.env.BACKEND_URL = "http://127.0.0.1:" + upstream.address().port;
  process.env.LOCAL_OPERATOR_TOKEN = "test-service-token";
  const routes = [
    { method: "GET", re: /^\/v1\/affiliate\/reversals$/ },
    { method: "POST", re: /^\/v1\/affiliate\/reversals$/ },
  ];
  const web = http.createServer((req, res) =>
    handleProxy(
      req,
      res,
      new URL(req.url, "http://127.0.0.1"),
      { role: "operator", csrf: "csrf" },
      routes,
    ),
  );
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  try {
    const url =
      "http://127.0.0.1:" + web.address().port + "/api/v1/affiliate/reversals";
    let response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(forwarded, 1);
    response = await fetch(url, {
      method: "POST",
      headers: { "X-CSRF-Token": "csrf", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "CHANNEL_ONLY");
    assert.equal(forwarded, 1);
  } finally {
    await Promise.all([
      new Promise((r) => web.close(r)),
      new Promise((r) => upstream.close(r)),
    ]);
  }
});
