import { useState } from "react";
import { request } from "../lib/api";
export type Session = {
  role: "operator" | "approver";
  subject: string;
  csrf: string;
};
export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [role, setRole] = useState("operator"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="logo">
          E<span>↗</span>
        </div>
        <h1>
          让每一笔佣金
          <br />
          有据可循。
        </h1>
        <p>ExCommission</p>
        <div className="login-flow">
          业务事实 → 规则计算 → 结算审批 → 付款核验
        </div>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            onLogin(
              (
                await request("/auth/login", {
                  method: "POST",
                  body: { role, password },
                })
              ).data,
            );
            setPassword("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">本地管理工作台</span>
        <h2>登录 ExCommission</h2>
        <p className="muted">本地双身份沙箱 · 独立申请与审批</p>
        <label className="field">
          登录身份
          <select
            aria-label="登录身份"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="operator">业务申请人</option>
            <option value="approver">独立审批人</option>
          </select>
        </label>
        <label className="field">
          本地登录口令
          <input
            aria-label="本地登录口令"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "登录中…" : "进入工作台 →"}
        </button>
        <small>
          口令位于本项目本地 .env 的 WEB_OPERATOR_PASSWORD /
          WEB_APPROVER_PASSWORD。登录后不向浏览器暴露后端令牌。
        </small>
      </form>
    </div>
  );
}
