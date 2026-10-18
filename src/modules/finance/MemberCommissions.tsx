import {PagedList} from '../../components/PagedList';
import {useCursorPages} from '../../components/useCursorPages';
import { useMemberLocale } from "../member/affiliate/locale";
import { useRef, useState } from "react";
import { request, ApiError } from "../../lib/api";
import type { Session } from "../../auth/Login";
import { displayMoney } from "../../lib/financeMoney";
type Order = {
  instruction_id: string;
  amount_minor: string;
  revision: number;
  claim_status: string;
};
type Statement = {
  statement_id: string;
  period: string;
  currency: string;
  total_minor: string;
  review_status: string;
  orders: Order[];
};
const names: Record<string, string> = {
  WAITING_REVIEW: "待审核",
  CANCELLED: "取消派发",
  APPROVED: "审核通过",
  PREPARING: "准备中",
  CLAIMABLE: "待领取",
  PROCESSING: "领取处理中",
  CLAIMED: "已领取",
  FAILED: "领取失败",
  RECONCILIATION_EXCEPTION: "核验异常",
};
export function MemberCommissions({
  session,
  onExpired,
  disabled = false,
}: {
  session: Session;
  onExpired: () => void;
  disabled?: boolean;
}) {
  const { t, locale } = useMemberLocale();
  const [rows, setRows] = useState<Statement[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [wallets, setWallets] = useState<any[]>([]),
    [entries, setEntries] = useState<any[]>([]),
    [historyKind, setHistoryKind] = useState("");
  const pagination=useCursorPages(),historyPages=useCursorPages();
  const [historyNext,setHistoryNext]=useState<string|null>(null),[historyPath,setHistoryPath]=useState("");
  const keys = useRef(new Map<string, string>());
  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function load(after = "",size=pagination.size) {
    const r = await request(
      "/v1/me/commissions?limit="+size +
        (after ? "&after_id=" + encodeURIComponent(after) : ""),
    );
    setRows(r.data.rows);pagination.record(after);
    setNext(r.data.next_after_id);
  }
  async function loadHistory(kind=historyPath,after='',size=historyPages.size){await guard(async()=>{const q=new URLSearchParams({limit:String(size)});if(after)q.set('after_id',after);const r=await request('/v1/me/'+kind+'?'+q);setEntries(r.data.rows);setHistoryNext(r.data.next_after_id||null);setHistoryPath(kind);setHistoryKind(kind==='wallet-changes'?'账变记录':'交易历史');historyPages.record(after)})}
  async function claim(order: Order) {
    await guard(async () => {
      const fingerprint = order.instruction_id + ":" + order.revision;
      let key = keys.current.get(fingerprint);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(fingerprint, key);
      }
      await request(
        "/v1/me/commission-orders/" +
          encodeURIComponent(order.instruction_id) +
          "/claim",
        {
          method: "POST",
          body: { expected_revision: order.revision },
          csrf: session.csrf,
          key,
        },
      );
      await load();
    });
  }
  return (
    <section aria-label="本人佣金">
      <h2>{t("佣金领取")}</h2>
      <button
        disabled={busy}
        onClick={() =>
          guard(async () => {
            const r = await request("/v1/me/wallets");
            setWallets(r.data.rows);
          })
        }
      >
        {t("查看真金钱包")}
      </button>
      {wallets.map((v) => (
        <p key={v.currency}>
          真金余额：{displayMoney(v.balance_minor, v.currency)}
        </p>
      ))}
      {[
        ["wallet-transactions", t("交易历史")],
        ["wallet-changes", t("账变记录")],
      ].map(([kind, label]) => (
        <button
          key={kind}
          disabled={busy}
          onClick={() =>
            void loadHistory(kind)
          }
        >
          {label}
        </button>
      ))}
      {historyKind && (
        <section aria-label={historyKind}>
          <h3>
            {t(historyPath === "wallet-changes" ? "账变记录" : "交易历史")}
          </h3>
          <PagedList paging={{page:historyPages.page,size:historyPages.size,more:Boolean(historyNext),busy,onNext:()=>void loadHistory(historyPath,historyNext||''),onPrevious:()=>void loadHistory(historyPath,historyPages.previous),onSize:size=>{historyPages.setSize(size);void loadHistory(historyPath,'',size)}}}>{entries.map((v) => (
            <p key={v.transaction_id}>
              {v.created_at} · {displayMoney(v.amount_minor, v.currency)}
              {v.balance_before_minor !== undefined
                ? " · " +
                  displayMoney(v.balance_before_minor, v.currency) +
                  " → " +
                  displayMoney(v.balance_after_minor, v.currency)
                : ""}
            </p>
          ))}</PagedList>
        </section>
      )}
      <button disabled={busy} onClick={() => guard(() => load())}>
        {t("刷新我的佣金")}
      </button>
      {error && <p role="alert">{error}</p>}
      <p>
        {t(
          "仅显示本人佣金。领取受理后请刷新确认结果；结果未知时保留原单核验。",
        )}
      </p>
      <PagedList paging={{page:pagination.page,size:pagination.size,more:Boolean(next),busy,onNext:()=>void guard(()=>load(next||'')),onPrevious:()=>void guard(()=>load(pagination.previous)),onSize:size=>{pagination.setSize(size);void guard(()=>load('',size))}}}>{rows.map((s) => (
        <article key={s.statement_id}>
          <h3>
            {s.period} · {displayMoney(s.total_minor, s.currency)}
          </h3>
          <p>{t(names[s.review_status] || s.review_status)}</p>
          {s.orders.length === 0 && s.review_status === "APPROVED" && (
            <p>{t("派发准备中")}</p>
          )}
          {s.orders.map((o) => (
            <div key={o.instruction_id}>
              <span>
                {displayMoney(o.amount_minor, s.currency)} ·{" "}
                {t(names[o.claim_status] || o.claim_status)}
              </span>
              {o.claim_status === "CLAIMABLE" && (
                <button disabled={busy || disabled} onClick={() => claim(o)}>
                  {t("领取佣金")}
                </button>
              )}
            </div>
          ))}
        </article>
      ))}</PagedList>
      {!rows.length && <p>{t("暂无记录，请刷新查询。")}</p>}
    </section>
  );
}
