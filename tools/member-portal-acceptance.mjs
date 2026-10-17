import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import jsQR from "jsqr";
const base = "http://127.0.0.1:18184",
  invite = "0123456789abcdef0123456789abcdef",
  shareURL = "https://members.example/register?invite=" + invite;
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "18184",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
  browser = await chromium.launch();
  for (const [kind, width, height] of [
    ["pc", 1280, 900],
    ["h5", 375, 812],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const p = await context.newPage(),
      external = [],
      errors = [],
      mutations = [];
    p.setDefaultTimeout(5000);
    let hasLink = false;
    p.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(base) && !u.startsWith("data:")) external.push(u);
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/auth/session", (r) =>
      r.fulfill({
        json: {
          data: { role: "member", subject: "member-demo", csrf: "csrf" },
        },
      }),
    );
    await p.route("**/api/v1/**", (r) => {
      const req = r.request(),
        u = new URL(req.url());
      assert.ok(u.pathname.startsWith("/api/v1/"));
      u.pathname = u.pathname.slice(4);
      let data;
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        mutations.push({ path: u.pathname, body });
        assert.ok(req.headers()["idempotency-key"]);
        assert.equal(req.headers()["x-csrf-token"], "csrf");
        if (u.pathname === "/v1/me/referral-links") {
          assert.deepEqual(body, {});
          hasLink = true;
          data = { code: invite, url: shareURL };
        } else if (u.pathname === "/v1/me/referral-binding") {
          assert.deepEqual(body, { code: invite });
          data = { status: "BOUND" };
        } else throw Error(u.pathname);
        return r.fulfill({
          status: u.pathname.endsWith("links") ? 201 : 200,
          json: { data },
        });
      }
      if (u.pathname === "/v1/me/rewards")
        data = {
          rows: [
            {
              program_id: "p1",
              name: "好友充值与投注奖励",
              active: true,
              starts_at: "2026-10-01T00:00:00Z",
              ends_at: "2026-11-01T00:00:00Z",
              conditions: [
                { metric: "累计充值", unit: "USD", threshold: "100.00000000" },
                {
                  metric: "累计有效投注",
                  unit: "USD",
                  threshold: "300.00000000",
                },
              ],
              qualified_members: 2,
              triggered_members: 1,
            },
          ],
          next_after_id: null,
        };
      else if (u.pathname === "/v1/me/agent-rules")
        data = {
          agent_enabled: true,
          configured: true,
          is_agent: true,
          rows: [
            {
              plan_name: "站点代理计划",
              currency: "USD",
              minimum_payout_minor: "100",
              rules: [
                {
                  name: "比例佣金",
                  description: "计佣比例10%；按已审核资格和实际关系层级结算",
                },
              ],
            },
          ],
        };
      else if (u.pathname === "/v1/me/team")
        data = {
          rows: [
            {
              user_id: "u1",
              agent_id: null,
              display_name: "团队会员",
              depth: 1,
              status: "MEMBER",
              statistics: {
                deposit_minor: "10000",
                withdrawal_minor: "0",
                bet_minor: "30000",
                valid_bet_minor: "30000",
                vip: "VIP1",
                login_ip: null,
              },
            },
          ],
          summary: {
            members: 1,
            missing_statistics: 0,
            complete: true,
            deposit_minor: "10000",
            withdrawal_minor: "0",
            bet_minor: "30000",
            valid_bet_minor: "30000",
          },
          next_after_id: null,
          as_of: "2026-10-17T00:00:00Z",
        };
      else if (u.pathname === "/v1/me/earnings")
        data = {
          rows: [
            {
              currency: "USD",
              target_minor: "10000",
              pending_minor: "2000",
              available_minor: "3000",
              frozen_minor: "1000",
              reserved_minor: "0",
              paid_minor: "4000",
              recovered_minor: "0",
              debt_minor: "0",
            },
          ],
        };
      else if (u.pathname === "/v1/me/referral-link") {
        if (!hasLink)
          return r.fulfill({
            status: 404,
            json: { error: { code: "NOT_FOUND" } },
          });
        data = { code: invite, url: shareURL };
      } else throw Error(u.pathname);
      return r.fulfill({ json: { data } });
    });
    await p.goto(base);
    await p.getByText("好友充值与投注奖励", { exact: true }).waitFor();
    assert.equal(
      await p.getByRole("navigation", { name: "主导航" }).count(),
      0,
    );
    await p.getByRole("button", { name: "我的团队", exact: true }).click();
    await p.getByRole("button", { name: "查询代理与团队" }).click();
    await p.getByRole("cell", { name: /团队会员/ }).waitFor();
    assert.equal(
      await p.getByRole("columnheader", { name: "登录IP" }).count(),
      0,
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "team no page overflow",
    );
    await p.getByRole("button", { name: "我的收益", exact: true }).click();
    await p.getByText("40.00 USD", { exact: true }).waitFor();
    await p.getByRole("button", { name: "代理规则", exact: true }).click();
    await p.getByText("站点代理计划", { exact: true }).waitFor();
    await p.getByText("比例佣金", { exact: true }).waitFor();
    await p.getByRole("button", { name: "分享推广", exact: true }).click();
    await p
      .getByRole("button", { name: "生成专属邀请链接", exact: true })
      .click();
    const image = p.getByAltText("专属邀请二维码");
    await image.waitFor();
    const pixels = await image.evaluate(async (img) => {
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
      return { data: Array.from(d.data), width: d.width, height: d.height };
    });
    const decoded = jsQR(
      new Uint8ClampedArray(pixels.data),
      pixels.width,
      pixels.height,
    );
    assert.equal(decoded?.data, shareURL);
    await p.getByRole("button", { name: "复制邀请链接", exact: true }).click();
    await p.getByText("邀请链接已复制", { exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => navigator.clipboard.readText()),
      shareURL,
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "no page overflow " + kind,
    );
    await p.screenshot({
      path: "/tmp/excommission-member-" + kind + ".png",
      fullPage: true,
    });
    const before = mutations.length;
    await p.goto(base + "?invite=" + invite);
    await p.getByRole("button", { name: "确认本人邀请关系" }).waitFor();
    assert.equal(mutations.length, before, "must not bind silently");
    await p.getByRole("button", { name: "确认本人邀请关系" }).click();
    await p.getByText("邀请关系已确认", { exact: true }).waitFor();
    assert.equal(new URL(p.url()).searchParams.has("invite"), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  }
  console.log(
    "PASS: PC1280/H5375 rewards/team/earnings/rules/share, private-IP exclusion, real QR decoding, clipboard, no external QR service, explicit invite binding and no horizontal page overflow; mocked business HTTP",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
