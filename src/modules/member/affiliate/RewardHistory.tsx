import {useCursorPages} from '../../../components/useCursorPages';
import {PagedTable} from '../../../components/PagedTable';
import { useEffect, useRef, useState } from "react";
import { request, ApiError } from "../../../lib/api";
import { amount, rewardScale } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
type Row = Record<string, any>;
const kinds: Record<string, string> = {
  REFERRAL: "推荐奖励",
  INVITEE: "受邀奖励",
  COMMISSION: "每日佣金",
};
const statuses: Record<string, string> = {
  CLAIMABLE: "待领取",
  CLAIMED: "已领取",
  PENDING_REVIEW: "待审核",
  CANCELLED: "已取消",
};
export function RewardHistory({
  scale,
  reloadKey,
  onDetail,
  onExpired,
}: {
  scale: number;
  reloadKey: number;
  onDetail: (r: Row) => void;
  onExpired: () => void;
}) {
  const { t, locale } = useMemberLocale();
  const pagination=useCursorPages();
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<Row[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const serial = useRef(0),
    snapshot = useRef<Record<string, string> | null>(null),
    filters = useRef({ from, to });
  filters.current = { from, to };
  async function load(after = "",size=pagination.size,reuse=false) {
    const current = ++serial.current;
    setBusy(true);
    setError("");
    try {
      // 翻页固定首屏的日期、观察时间与快照版本，避免并发领取或新奖励使历史跨页漂移。
      const query: Record<string, string> =
        (after||reuse) && snapshot.current
          ? { ...snapshot.current }
          : {
              from: filters.current.from + "T00:00:00Z",
              to: filters.current.to + "T00:00:00Z",
            };
      const params = new URLSearchParams(query);
      params.set("limit", String(size));
      if (after) params.set("after_id", after);
      const response = await request("/v1/me/affiliate/records?" + params);
      if (current !== serial.current) return;
      const data = response.data;
      snapshot.current = {
        from: query.from,
        to: query.to,
        as_of: data.as_of,
        snapshot_revision: String(data.snapshot_revision),
      };
      setRows(data.rows);
      pagination.record(after);
      setNext(data.next_after_id || null);
    } catch (e) {
      if (current !== serial.current) return;
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(t((e as Error).message));
    } finally {
      if (current === serial.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [reloadKey]);
  return (
    <section className="member-card">
      <h2>{t("奖励记录")}</h2>
      <p className="muted">{t("记录日期按UTC查询，每次最多查询一年。")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          {t("开始日期")}
          <input
            aria-label={t("奖励记录开始日期")}
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("结束日期（不含）")}
          <input
            aria-label={t("奖励记录结束日期")}
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button disabled={busy} type="submit">
          {t("查询奖励记录")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="affiliate-table-wrap">
        <PagedTable paging={{page:pagination.page,size:pagination.size,more:Boolean(next),busy,onNext:()=>void load(next||''),onPrevious:()=>void load(pagination.previous,pagination.size,true),onSize:size=>{pagination.setSize(size);void load('',size)}}}>
          <thead>
            <tr>
              {["方案", "类型", "金额", "状态", "时间", "详情"].map((n) => (
                <th key={n}>{t(n)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reward_id}>
                <td>{row.program_id || t("原有方案")}</td>
                <td>{t(kinds[row.kind] || row.kind)}</td>
                <td>
                  {amount(row.amount_minor, rewardScale(row, scale))}{" "}
                  {row.currency}
                </td>
                <td>{t(statuses[row.status] || row.status)}</td>
                <td>
                  {new Date(row.claimed_at || row.unlocked_at).toLocaleString(
                    locale,
                  )}
                </td>
                <td>
                  <button onClick={() => onDetail(row)}>{t("查看")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </PagedTable>
      </div>
      {!rows.length && !busy && <p className="muted">{t("暂无奖励记录")}</p>}
    </section>
  );
}
