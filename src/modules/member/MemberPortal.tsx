import {
  MemberLocaleProvider,
  MemberLanguage,
  useMemberLocale,
} from "./affiliate/locale";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AgentBusinessReport } from "../affiliate/AgentReport";
import { AffiliateRewards } from "./affiliate/AffiliateRewards";
import { request, ApiError } from "../../lib/api";
import type { Session } from "../../auth/Login";
import { AgentDirectory } from "../agents/AgentDirectory";
import { MemberCommissions } from "../finance/MemberCommissions";
import { displayMoney } from "../finance/CommissionReview";
type Row = Record<string, any>;
const tabs = [
  ["rewards", "推荐奖励"],
  ["team", "我的团队"],
  ["earnings", "我的收益"],
  ["rules", "代理规则"],
  ["share", "分享推广"],
];
export function MemberPortal(props: {
  session: Session;
  onExpired: () => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <MemberLocaleProvider>
      <MemberContent {...props} />
    </MemberLocaleProvider>
  );
}
function MemberContent({
  session,
  onExpired,
  onLogout,
}: {
  session: Session;
  onExpired: () => void;
  onLogout: () => Promise<void>;
}) {
  const { t, locale } = useMemberLocale();
  const [tab, setTab] = useState("rewards"),
    [rewards, setRewards] = useState<Row[]>([]),
    [rules, setRules] = useState<Row[]>([]),
    [earnings, setEarnings] = useState<Row[]>([]),
    [link, setLink] = useState<Row | null>(null),
    [qr, setQR] = useState(""),
    [enabled, setEnabled] = useState(true),
    [isAgent, setIsAgent] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [invite, setInvite] = useState(
      () => new URLSearchParams(location.search).get("invite") || "",
    );
  const keys = useRef(new Map<string, string>());
  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : t("操作未完成"));
    } finally {
      setBusy(false);
    }
  }
  function key(action: string) {
    let v = keys.current.get(action);
    if (!v) {
      v = crypto.randomUUID();
      keys.current.set(action, v);
    }
    return v;
  }
  async function showLink(value: Row) {
    setLink(value);
    setQR(
      await QRCode.toDataURL(value.url, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    );
  }
  async function savePoster() {
    if (!link?.url || !qr) return;
    // 海报只使用服务端返回的专属注册入口，不拼装另一套邀请码或注册路径。
    const image = new Image();
    image.src = qr;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1050;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("当前浏览器无法生成海报"));
    ctx.fillStyle = "#102842";
    ctx.fillRect(0, 0, 750, 1050);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText(t("邀请加入我的团队"), 375, 150, 650);
    ctx.font = "26px sans-serif";
    ctx.fillText(t("扫码注册，开启代理之旅"), 375, 220, 650);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(155, 310, 440, 440);
    ctx.drawImage(image, 175, 330, 400, 400);
    const code = new URL(link.url).searchParams.get("ic");
    ctx.font = "bold 36px sans-serif";
    if (code) ctx.fillText(t("邀请码：{code}", { code }), 375, 850);
    ctx.font = "24px sans-serif";
    ctx.fillText(t("收益以实际业务、审核及入账结果为准。"), 375, 960, 650);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error(t("海报生成失败"))),
        "image/png",
      ),
    );
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "邀请海报.png";
      anchor.click();
      setNotice(t("邀请海报已生成"));
    } finally {
      // 下载交给浏览器后再释放资源，避免移动端尚未读取图片时链接失效。
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
  async function load(after = "") {
    await guard(async () => {
      if (tab === "rewards") {
        const r = await request(
          "/v1/me/rewards?limit=25" +
            (after ? "&after_id=" + encodeURIComponent(after) : ""),
        );
        setRewards(r.data.rows);
        setNext(r.data.next_after_id);
      }
      if (tab === "earnings") {
        const r = await request("/v1/me/earnings");
        setEarnings(r.data.rows);
      }
      if (tab === "rules") {
        const r = await request("/v1/me/agent-rules");
        setRules(r.data.rows);
        setEnabled(r.data.agent_enabled);
        setIsAgent(r.data.is_agent);
      }
      if (tab === "share") {
        try {
          await showLink((await request("/v1/me/referral-link")).data);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            setLink(null);
            setQR("");
          } else throw e;
        }
      }
    });
  }
  useEffect(() => {
    if (tab !== "team") void load();
  }, [tab]);
  useEffect(() => {
    let active = true;
    request("/v1/me/agent-rules")
      .then((r) => {
        if (active) {
          setEnabled(r.data.agent_enabled);
          setIsAgent(r.data.is_agent);
          setRules(r.data.rows);
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onExpired();
      });
    return () => {
      active = false;
    };
  }, []);
  async function bind() {
    await guard(async () => {
      await request("/v1/me/referral-binding", {
        method: "POST",
        body: { code: invite },
        csrf: session.csrf,
        key: key("bind:" + invite),
      });
      setNotice("邀请关系已确认");
      setInvite("");
      const u = new URL(location.href);
      u.searchParams.delete("invite");
      history.replaceState(null, "", u);
    });
  }
  const decimal = (v: string) =>
    v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
  return (
    <div className="member-portal">
      <header className="member-header">
        <a className="member-brand" href="#">
          {t("佣金中心")}
        </a>
        <MemberLanguage />
        <span>{t("欢迎回来")}</span>
        <button onClick={onLogout}>{t("退出登录")}</button>
      </header>
      <main className="member-main">
        <section className="member-intro">
          <p>{t("邀请同行 · 分享收益")}</p>
          <h1>{t("我的代理中心")}</h1>
          <p>{t("查看团队与奖励，让每一笔佣金清楚可查。")}</p>
        </section>
        {!enabled && (
          <p className="member-banner" role="status">
            {t("代理奖励和领取已暂停，历史记录仍可查询。")}
          </p>
        )}
        {invite && (
          <section className="member-card">
            <h2>{t("确认邀请关系")}</h2>
            <p>
              {t(
                "登录后确认本人邀请归属。已有代理身份或归属时不能通过此方式修改。",
              )}
            </p>
            <button disabled={busy || !enabled} onClick={bind}>
              {t("确认本人邀请关系")}
            </button>
            <button onClick={() => setInvite("")}>{t("暂不确认")}</button>
          </section>
        )}
        <nav className="member-tabs" aria-label={t("会员功能")}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {tab === "rewards" && (
          <AffiliateRewards
            session={session}
            enabled={enabled}
            onExpired={onExpired}
            fallback={
              <section aria-label={t("推荐奖励")} className="member-content">
                <div className="member-heading">
                  <h2>{t("推荐奖励")}</h2>
                  <button disabled={busy} onClick={() => load()}>
                    {t("刷新推荐奖励")}
                  </button>
                </div>
                <p>
                  {t(
                    "全部条件同时达标后触发一次奖励，核算与审核结果以我的收益为准。",
                  )}
                </p>
                <div className="member-grid">
                  {rewards.map((r) => (
                    <article className="member-card" key={r.program_id}>
                      <span className="member-tag">
                        {t(r.active ? "进行中" : "非活动期")}
                      </span>
                      <h3>{r.name}</h3>
                      <ul>
                        {r.conditions.map((c: Row) => (
                          <li key={c.metric}>
                            {c.metric}
                            {t("不少于")}
                            {decimal(c.threshold)} {c.unit}
                          </li>
                        ))}
                      </ul>
                      <p>
                        {t("已达标")}
                        {r.qualified_members}
                        {t("人 · 已触发")} {r.triggered_members}
                        {t("人")}
                      </p>
                    </article>
                  ))}
                </div>
                {!busy && !rewards.length && (
                  <p className="member-empty">
                    {t("当前没有已发布的推荐奖励。")}
                  </p>
                )}
                {next && (
                  <button disabled={busy} onClick={() => load(next)}>
                    {t("下一页奖励")}
                  </button>
                )}
              </section>
            }
          />
        )}
        {tab === "team" && (
          <section className="member-content">
            <AgentBusinessReport
              member
              onExpired={onExpired}
              fallback={<AgentDirectory member onExpired={onExpired} />}
            />
          </section>
        )}
        {tab === "earnings" && (
          <section className="member-content" aria-label={t("我的收益")}>
            <div className="member-heading">
              <h2>{t("我的收益")}</h2>
              <button disabled={busy} onClick={() => load()}>
                {t("刷新收益汇总")}
              </button>
            </div>
            {earnings.map((r) => (
              <div className="member-grid" key={r.currency}>
                {[
                  ["target_minor", "累计佣金"],
                  ["pending_minor", "待审核结算"],
                  ["available_minor", "已结算余额"],
                  ["frozen_minor", "冻结余额"],
                  ["reserved_minor", "领取处理中"],
                  ["paid_minor", "累计已发放"],
                  ["recovered_minor", "已追回"],
                  ["debt_minor", "待抵扣"],
                ].map(([field, label]) => (
                  <article className="member-stat" key={field}>
                    <small>{t(label)}</small>
                    <strong>{displayMoney(r[field], r.currency)}</strong>
                  </article>
                ))}
              </div>
            ))}
            {!earnings.length && !busy && (
              <p className="member-empty">{t("暂无佣金收益记录。")}</p>
            )}
            <MemberCommissions
              session={session}
              onExpired={onExpired}
              disabled={!enabled}
            />
          </section>
        )}
        {tab === "rules" && (
          <section className="member-content" aria-label={t("代理规则")}>
            <h2>{t("代理规则")}</h2>
            {rules.map((r, i) => (
              <article className="member-card" key={i}>
                <h3>{r.plan_name}</h3>
                <p>
                  {t("最低派发金额：")}
                  {displayMoney(r.minimum_payout_minor, r.currency)}
                </p>
                {r.rules.map((rule: Row, j: number) => (
                  <div key={j}>
                    <h4>{rule.name}</h4>
                    <p>{rule.description}</p>
                  </div>
                ))}
              </article>
            ))}
            {!rules.length && !busy && (
              <p className="member-empty">{t("当前没有生效的代理方案。")}</p>
            )}
          </section>
        )}
        {tab === "share" && (
          <section
            className="member-content member-share"
            aria-label={t("分享推广")}
          >
            <h2>{t("分享推广")}</h2>
            {link?.url && new URL(link.url).searchParams.has("ic") && (
              <p className="muted">
                {t("好友通过链接注册，系统自动确认邀请归属。")}
              </p>
            )}
            {!isAgent && <p>{t("尚未开通代理资格，开通后可生成推广链接。")}</p>}
            <p>{t("分享专属链接或二维码，邀请好友进入会员入口。")}</p>
            <button
              disabled={busy || !enabled || !isAgent}
              onClick={() =>
                guard(async () => {
                  const r = await request("/v1/me/referral-links", {
                    method: "POST",
                    body: {},
                    csrf: session.csrf,
                    key: key("create-link"),
                  });
                  await showLink(r.data);
                })
              }
            >
              {link ? t("刷新专属二维码") : t("生成专属邀请链接")}
            </button>
            {link && (
              <div className="member-card">
                {qr && (
                  <img
                    className="member-qr"
                    src={qr}
                    alt={t("专属邀请二维码")}
                    width={240}
                    height={240}
                  />
                )}
                <label>
                  {t("专属邀请链接")}
                  <input
                    aria-label={t("专属邀请链接")}
                    readOnly
                    value={link.url}
                  />
                </label>
                <div className="member-share-actions">
                  <button
                    disabled={!enabled || busy || !qr}
                    onClick={() => guard(savePoster)}
                  >
                    {t("保存邀请海报")}
                  </button>
                  <button
                    disabled={!enabled}
                    onClick={() =>
                      guard(async () => {
                        await navigator.clipboard.writeText(link.url);
                        setNotice(t("邀请链接已复制"));
                      })
                    }
                  >
                    {t("复制邀请链接")}
                  </button>
                  {typeof navigator.share === "function" && (
                    <button
                      disabled={!enabled}
                      onClick={() =>
                        guard(async () => {
                          await navigator.share({
                            title: t("邀请加入我的团队"),
                            url: link.url,
                          });
                        })
                      }
                    >
                      {t("系统分享")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="member-footer">
        {t("收益以实际业务、审核及入账结果为准。")}
      </footer>
    </div>
  );
}
