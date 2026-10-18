import { useEffect, useRef, useState } from "react";
import { ApiError, request } from "../../../lib/api";
import type { Session } from "../../../auth/Login";
import { amount } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
const names: Record<string, string> = {
  REFERRAL: "推荐奖励",
  INVITEE: "受邀奖励",
  COMMISSION: "每日佣金",
};
const states: Record<string, string> = {
  CLAIMABLE: "待领取",
  CLAIMED: "已领取",
  PENDING_REVIEW: "待审核",
  CANCELLED: "已取消",
};
// 每次仅领取一个方案；币种和精度取原权益快照，禁止将不同币种相加展示。
export function ProgramRewards({
  session,
  onExpired,
}: {
  session: Session;
  onExpired: () => void;
}) {
  const { t } = useMemberLocale();
  const [rows, setRows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  async function load() {
    const r = await request("/v1/me/affiliate/program-rewards");
    setRows(r.data.rewards);
  }
  useEffect(() => {
    load().catch((e) => {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e.message);
    });
  }, []);
  async function claim(program: string, kind: string) {
    const fingerprint = program + ":" + kind;
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(fingerprint, key);
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/v1/me/affiliate/claims", {
        method: "POST",
        body: { kind, program_id: program },
        key,
        csrf: session.csrf,
      });
      keys.current.delete(fingerprint);
      setNotice(t("领取成功"));
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      if (e instanceof ApiError && e.status < 500)
        keys.current.delete(fingerprint);
      setError(e instanceof Error ? e.message : t("操作失败"));
    } finally {
      setBusy(false);
    }
  }
  if (!rows.length && !error) return null;
  return (
    <section className="member-card">
      <h2>{t("独立方案奖励")}</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("方案")}</th>
              <th>{t("奖励类型")}</th>
              <th>{t("金额")}</th>
              <th>{t("状态")}</th>
              <th>{t("操作")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reward_id}>
                <td>
                  {r.program_id} / {t("版本")} {r.config_revision}
                </td>
                <td>{t(names[r.kind] || r.kind)}</td>
                <td>
                  {amount(
                    r.amount_minor,
                    r.program_configuration.config.currency_scale,
                  )}{" "}
                  {r.currency}
                </td>
                <td>{t(states[r.status] || r.status)}</td>
                <td>
                  {r.status === "CLAIMABLE" && (
                    <button
                      disabled={busy}
                      onClick={() => void claim(r.program_id, r.kind)}
                    >
                      {t("领取")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
