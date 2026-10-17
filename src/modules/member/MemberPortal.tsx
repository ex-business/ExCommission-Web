import { MemberTeamDashboard } from "./affiliate/TeamDashboard";
import { RewardCommunity, SocialShare } from "./affiliate/Community";
import { amount } from "../affiliate/money";
import { PublishedRules } from "./affiliate/PublishedRules";
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
import { displayMoney } from "../../lib/financeMoney";
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
    [shareModal, setShareModal] = useState(false),
    [invitationPrompt, setInvitationPrompt] = useState(false),
    [presentation, setPresentation] = useState<Row | null>(null),
    [presentationReady, setPresentationReady] = useState(false),
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
    ctx.fillText(t("邀请朋友 双方获利"), 375, 95, 650);
    ctx.font = "26px sans-serif";
    ctx.fillText(
      presentation?.profile?.display_name || session.subject,
      375,
      150,
      650,
    );
    if (presentation?.configuration) {
      const c = presentation.configuration.config;
      const maximum = c.steps.reduce(
        (sum: bigint, step: Row) => sum + BigInt(step.reward_minor),
        0n,
      );
      ctx.fillText(
        t("邀请最高赚取") +
          " " +
          amount(maximum.toString(), c.currency_scale) +
          " " +
          c.currency,
        375,
        210,
        650,
      );
      ctx.fillText(
        t("你的朋友获得") +
          " " +
          amount(c.invitee_reward_minor, c.currency_scale) +
          " " +
          c.currency,
        375,
        260,
        650,
      );
    }
    ctx.font = "26px sans-serif";
    ctx.fillText(t("完成充值与投注条件后解锁奖励"), 375, 300, 650);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(155, 330, 440, 440);
    ctx.drawImage(image, 175, 350, 400, 400);
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
      if (tab === "earnings" && !presentation) {
        const r = await request("/v1/me/earnings");
        setEarnings(r.data.rows);
      }
      if (tab === "rules" && !presentation) {
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
    async function initialize() {
      try {
        const r = await request("/v1/me/affiliate/presentation");
        if (!active) return;
        if (r.data.configured) {
          setPresentation(r.data);
          setEnabled(
            r.data.site_enabled !== false &&
              !!r.data.configuration?.config.enabled,
          );
          setPresentationReady(true);
          // 可选弹窗失败不阻断已加载的会员功能；401仍按原登录过期处理。
          void request("/v1/me/affiliate/overview")
            .then((response) => {
              if (!active) return;
              const overview = response.data;
              const marker = "affiliate-invitation-seen:" + session.subject;
              if (
                overview.progress?.is_invited ||
                new URLSearchParams(location.search).has("ic")
              ) {
                try {
                  if (!sessionStorage.getItem(marker)) {
                    setInvitationPrompt(true);
                    sessionStorage.setItem(marker, "1");
                  }
                } catch {
                  setInvitationPrompt(true);
                }
              }
            })
            .catch((e) => {
              if (active && e instanceof ApiError && e.status === 401)
                onExpired();
            });

          return;
        }
      } catch (e) {
        // 仅明确缺少扩展端口时回退；鉴权、网络或服务故障不能伪装成旧模式。
        if (!(e instanceof ApiError && e.status === 404)) {
          if (active) {
            setError((e as Error).message);
            if (e instanceof ApiError && e.status === 401) onExpired();
          }
          return;
        }
      }
      try {
        const r = await request("/v1/me/agent-rules");
        if (active) {
          setEnabled(r.data.agent_enabled);
          setIsAgent(r.data.is_agent);
          setRules(r.data.rows);
          setPresentationReady(true);
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 401) onExpired();
        }
      }
    }
    void initialize();
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
          {presentation?.entry_visible && (
            <button
              onClick={() => {
                setTab("share");
                setShareModal(true);
              }}
            >
              {t("立即邀请赚钱")}
            </button>
          )}
        </section>
        {!presentationReady && (
          <p role="status">{error || t("正在读取代理入口配置…")}</p>
        )}
        {presentationReady && presentation?.entry_visible === false && (
          <p role="status">{t("本站代理功能暂未开放。")}</p>
        )}
        {presentationReady && presentation?.entry_visible !== false && (
          <>
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
            {invitationPrompt && presentation && (
              <section
                role="dialog"
                aria-modal="true"
                aria-label={t("邀请朋友 双方获利")}
                className="affiliate-site-dialog"
              >
                <button onClick={() => setInvitationPrompt(false)}>
                  {t("关闭")}
                </button>
                <h2>{t("邀请朋友 双方获利")}</h2>
                <p>
                  {t("邀请最高赚取")}{" "}
                  {amount(
                    presentation.configuration.config.steps
                      .reduce(
                        (sum: bigint, step: Row) =>
                          sum + BigInt(step.reward_minor),
                        0n,
                      )
                      .toString(),
                    presentation.configuration.config.currency_scale,
                  )}{" "}
                  {presentation.configuration.config.currency}
                </p>
                <p>
                  {t("你的朋友获得")}{" "}
                  {amount(
                    presentation.configuration.config.invitee_reward_minor,
                    presentation.configuration.config.currency_scale,
                  )}{" "}
                  {presentation.configuration.config.currency}
                </p>
                <button
                  onClick={() => {
                    setInvitationPrompt(false);
                    setTab("share");
                  }}
                >
                  {t("立即邀请赚钱")}
                </button>
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
                  <section
                    aria-label={t("推荐奖励")}
                    className="member-content"
                  >
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
                <MemberTeamDashboard onExpired={onExpired} />
                <AgentBusinessReport
                  member
                  onExpired={onExpired}
                  fallback={<AgentDirectory member onExpired={onExpired} />}
                />
              </section>
            )}
            {tab === "earnings" && presentation && (
              <AffiliateRewards
                session={session}
                enabled={enabled}
                onExpired={onExpired}
                fallback={null}
              />
            )}
            {tab === "earnings" && !presentation && (
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
            {tab === "rules" && presentation && (
              <PublishedRules presentation={presentation} />
            )}
            {tab === "rules" && !presentation && (
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
                  <p className="member-empty">
                    {t("当前没有生效的代理方案。")}
                  </p>
                )}
              </section>
            )}
            {tab === "share" && (
              <section
                className={
                  shareModal
                    ? "affiliate-site-dialog"
                    : "member-content member-share"
                }
                role={shareModal ? "dialog" : undefined}
                aria-modal={shareModal || undefined}
                aria-label={t("分享推广")}
              >
                {shareModal && (
                  <button onClick={() => setShareModal(false)}>
                    {t("关闭")}
                  </button>
                )}
                <h2>{t("分享推广")}</h2>
                {link?.url && new URL(link.url).searchParams.has("ic") && (
                  <p className="muted">
                    {t("好友通过链接注册，系统自动确认邀请归属。")}
                  </p>
                )}
                {!isAgent && (
                  <p>{t("尚未开通代理资格，开通后可生成推广链接。")}</p>
                )}
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
                    <p>
                      {t("邀请码")}{" "}
                      {link.code || new URL(link.url).searchParams.get("ic")}
                    </p>
                    <button
                      onClick={() =>
                        guard(async () => {
                          await navigator.clipboard.writeText(
                            link.code ||
                              new URL(link.url).searchParams.get("ic") ||
                              "",
                          );
                          setNotice(t("邀请码已复制"));
                        })
                      }
                    >
                      {t("复制邀请码")}
                    </button>
                    <SocialShare
                      social={presentation?.configuration?.config.social}
                      url={link.url}
                      text={
                        presentation
                          ? t(
                              "注册可获得{reward}，完成任务最高赚取{maximum}奖励。",
                              {
                                reward:
                                  amount(
                                    presentation.configuration.config
                                      .invitee_reward_minor,
                                    presentation.configuration.config
                                      .currency_scale,
                                  ) +
                                  " " +
                                  presentation.configuration.config.currency,
                                maximum:
                                  amount(
                                    presentation.configuration.config.steps
                                      .reduce(
                                        (sum: bigint, step: Row) =>
                                          sum + BigInt(step.reward_minor),
                                        0n,
                                      )
                                      .toString(),
                                    presentation.configuration.config
                                      .currency_scale,
                                  ) +
                                  " " +
                                  presentation.configuration.config.currency,
                              },
                            )
                          : t("邀请加入我的团队")
                      }
                      onNotice={setNotice}
                    />
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
          </>
        )}
        {presentation && presentation.entry_visible && (
          <RewardCommunity
            feed={presentation.feed}
            scale={presentation.configuration.config.currency_scale}
          />
        )}
      </main>
      <footer className="member-footer">
        {t("收益以实际业务、审核及入账结果为准。")}
      </footer>
    </div>
  );
}
