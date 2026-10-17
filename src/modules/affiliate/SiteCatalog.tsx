import { useEffect, useState } from "react";
import { request, ApiError } from "../../lib/api";
import { ConfigSummary } from "./AffiliateConfig";
import "./business.css";
type Row = Record<string, any>;
export function AffiliateSiteCatalog({ onExpired }: { onExpired: () => void }) {
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
        <table>
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
        </table>
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
