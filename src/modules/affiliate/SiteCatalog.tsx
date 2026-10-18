import {PagedTable} from '../../components/PagedTable';
import { amount } from "./money";
import type { Session } from "../../auth/Login";
import { useEffect, useRef, useState } from "react";
import { request, ApiError } from "../../lib/api";
import { AffiliateConfig, ConfigSummary } from "./AffiliateConfig";
import "./business.css";
type Row = Record<string, any>;
function LegacyAffiliateSiteCatalog({ onExpired }: { onExpired: () => void }) {
  const [rows, setRows] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setRows(
        (
          await request(
            "/v1/affiliate/sites?search=" + encodeURIComponent(search),
          )
        ).data.rows,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="af-admin">
      <header>
        <h2>已授权站点代理配置</h2>
        <p>
          只展示当前账号明确获授读取权限的站点。此处只读，编辑须使用对应站点的有权身份。
        </p>
      </header>
      <form
        className="af-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          站点 / 应用
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button disabled={busy}>查询</button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="af-table">
        <PagedTable>
          <thead>
            <tr>
              <th>站点</th>
              <th>应用</th>
              <th>状态</th>
              <th>主货币</th>
              <th>统计范围</th>
              <th>时区</th>
              <th>版本</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const current = row.configuration.current;
              return (
                <tr key={row.tenant_id + ":" + row.app_id}>
                  <td>{row.tenant_id}</td>
                  <td>{row.app_id}</td>
                  <td>
                    {current
                      ? current.config.enabled
                        ? "开启"
                        : "关闭"
                      : "尚未配置"}
                  </td>
                  <td>{current?.config.currency || "—"}</td>
                  <td>
                    {{
                      DAY: "自然日",
                      WEEK: "自然周",
                      MONTH: "自然月",
                      LIFETIME: "永久",
                    }[current?.config.grade_period as "DAY"] || "—"}
                  </td>
                  <td>{current?.config.timezone || "—"}</td>
                  <td>
                    {current?.revision || "—"}
                    {row.configuration.scheduled ? " · 有待生效版本" : ""}
                  </td>
                  <td>
                    <button disabled={!current} onClick={() => setDetail(row)}>
                      查看配置
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </PagedTable>
      </div>
      {detail && (
        <div className="affiliate-overlay" onClick={() => setDetail(null)}>
          <section
            className="af-card affiliate-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="站点代理配置详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="affiliate-toolbar">
              <h2>
                {detail.tenant_id} / {detail.app_id}
              </h2>
              <button onClick={() => setDetail(null)}>关闭</button>
            </div>
            <ConfigSummary config={detail.configuration.current.config} />
            {detail.configuration.scheduled && (
              <>
                <h3>
                  待生效版本 ·{" "}
                  {new Date(
                    detail.configuration.scheduled.effective_from,
                  ).toLocaleString()}
                </h3>
                <ConfigSummary config={detail.configuration.scheduled.config} />
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

// 总表管理是新增视图，保留原只读简表，写权限以服务端返回能力为准。
export function AffiliateSiteCatalog({
  onExpired,
  session,
  onApproval,
}: {
  onExpired: () => void;
  session: Session;
  onApproval: (id: string) => void;
}) {
  const [legacy, setLegacy] = useState(false);
  return (
    <section>
      <button onClick={() => setLegacy(!legacy)}>
        {legacy ? "切换配置管理总表" : "切换原只读简表"}
      </button>
      {legacy ? (
        <LegacyAffiliateSiteCatalog onExpired={onExpired} />
      ) : (
        <SiteManagement
          session={session}
          onExpired={onExpired}
          onApproval={onApproval}
        />
      )}
    </section>
  );
}
function SiteManagement({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL"),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState<Row | null>(null),
    [selected, setSelected] = useState("");
  // 查询、重置只接受最新响应，避免慢请求覆盖导出所依据的当前筛选。
  const requestSerial = useRef(0);
  async function load(query = search) {
    const serial = ++requestSerial.current;
    setBusy(true);
    setError("");
    try {
      const r = await request(
        "/v1/affiliate/sites?search=" + encodeURIComponent(query),
      );
      if (serial !== requestSerial.current) return;
      setRows(r.data.rows);
      setSelected("");
      setPage(1);
    } catch (e) {
      if (serial !== requestSerial.current) return;
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError((e as Error).message);
    } finally {
      if (serial === requestSerial.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const filtered = rows.filter(
    (r) =>
      status === "ALL" ||
      (status === "ON"
        ? r.configuration.current?.config.enabled
        : r.configuration.current && !r.configuration.current.config.enabled),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * size, currentPage * size);
  const date = (v: string) => (v ? new Date(v).toLocaleString() : "—");
  const cell = (r: Row) => {
    const c = r.configuration.current?.config;
    return [
      r.tenant_id,
      r.app_id,
      c
        ? c.levels
            .map(
              (l: Row) =>
                `Lv${l.level}: ${l.qualified_members}/${amount(l.daily_valid_bet_minor, c.currency_scale)}`,
            )
            .join("；")
        : "—",
      c
        ? `充值 ${amount(c.grade_condition.deposit_minor, c.currency_scale)} / 投注 ${amount(c.grade_condition.valid_bet_minor, c.currency_scale)} ${c.currency}`
        : "—",
      c
        ? c.steps
            .map(
              (s: Row) =>
                `新增${s.additional_members}人/${amount(s.reward_minor, c.currency_scale)} ${c.currency}`,
            )
            .join("；")
        : "—",
      c
        ? c.levels
            .map(
              (l: Row) =>
                `Lv${l.level}: ` +
                l.rates_ppm
                  .map((v: number) => amount(String(v), 4) + "%")
                  .join("/"),
            )
            .join("；")
        : "—",
      c
        ? c.venue_type_ids
            .map(
              (id: string) =>
                (
                  ({
                    SPORTS: "体育",
                    ESPORTS: "电竞",
                    LIVE: "真人",
                    LOTTERY: "彩票",
                    POKER: "棋牌",
                    SLOTS: "电子",
                    FISHING: "捕鱼",
                  }) as Record<string, string>
                )[id] || id,
            )
            .join("、")
        : "—",
      c ? (c.enabled ? "开启" : "关闭") : "未配置",
      date(r.created_at),
      date(r.updated_at),
      r.operator || "—",
    ];
  };
  const headers = [
    "所属站点",
    "应用",
    "代理等级（人数/日投注）",
    "有效会员条件",
    "推荐奖励",
    "返佣比例",
    "返佣场馆",
    "状态",
    "创建时间",
    "最近操作",
    "操作人",
  ];
  function exportRows() {
    const safe = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const text = [headers, ...filtered.map(cell)]
      .map((r) => r.map(safe).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "站点代理配置.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return (
    <section className="af-admin">
      <h2>站点代理配置总表</h2>
      <p>
        只展示明确授权站点；可写站点还必须具备目标站点配置权限。保存继续走独立审批，不改写历史奖励。
      </p>
      <form
        className="af-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          站点名称 / 应用
          <input
            aria-label="配置站点搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          状态
          <select
            aria-label="配置状态筛选"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">全部</option>
            <option value="ON">开启</option>
            <option value="OFF">关闭</option>
          </select>
        </label>
        <button disabled={busy}>查询</button>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setStatus("ALL");
            void load("");
          }}
        >
          重置
        </button>
        <button type="button" disabled={busy} onClick={exportRows}>
          导出当前条件全部配置
        </button>
      </form>
      <label>
        所属站点（单选）
        <select
          aria-label="配置所属站点"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">请选择站点</option>
          {rows.map((r, i) => (
            <option value={String(i)} key={r.tenant_id + ":" + r.app_id}>
              {r.tenant_id} / {r.app_id}
              {r.writable ? "" : "（只读）"}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={selected === "" || !rows[Number(selected)]?.writable}
        onClick={() => setTarget(rows[Number(selected)])}
      >
        添加 / 编辑配置
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="af-table">
        <PagedTable>
          <thead>
            <tr>
              <th>序号</th>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.tenant_id + ":" + r.app_id}>
                <td>{(currentPage - 1) * size + i + 1}</td>
                {cell(r).map((v, n) => (
                  <td key={n}>{v}</td>
                ))}
                <td>
                  <details>
                    <summary>查看配置</summary>
                    {r.configuration.current && (
                      <ConfigSummary config={r.configuration.current.config} />
                    )}
                  </details>
                  <button disabled={!r.writable} onClick={() => setTarget(r)}>
                    {r.configuration.current ? "编辑" : "添加"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </PagedTable>
      </div>
      <p>共 {filtered.length} 条</p>
      <label>
        每页
        <select
          aria-label="配置每页条数"
          value={size}
          onChange={(e) => {
            setSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[10, 20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}条/页
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={currentPage === 1}
        onClick={() => setPage(currentPage - 1)}
      >
        上一页
      </button>
      <span>
        {currentPage} / {pages}
      </span>
      <button
        disabled={currentPage >= pages}
        onClick={() => setPage(currentPage + 1)}
      >
        下一页
      </button>
      <label>
        前往页
        <input
          aria-label="配置前往页"
          type="number"
          min="1"
          max={pages}
          value={currentPage}
          onChange={(e) =>
            setPage(Math.max(1, Math.min(pages, Number(e.target.value) || 1)))
          }
        />
      </label>
      {target && (
        <section className="af-card">
          <button onClick={() => setTarget(null)}>关闭编辑</button>
          <AffiliateConfig
            key={target.tenant_id + ":" + target.app_id}
            siteTarget={{ tenant_id: target.tenant_id, app_id: target.app_id }}
            session={session}
            onExpired={onExpired}
            onApproval={onApproval}
          />
        </section>
      )}
    </section>
  );
}
