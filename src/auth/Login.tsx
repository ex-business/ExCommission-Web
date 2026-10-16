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
        <div className="logo">佣</div>
        <h1>
          佣金分润
          <br />
          管理系统
        </h1>
        <p>方案、代理、结算与付款</p>
        <div className="login-flow">
          方案配置 / 佣金结算 / 审批管理 / 数据报表
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
        <span className="eyebrow">管理后台</span>
        <h2>账号登录</h2>
        <p className="muted">请选择身份并输入登录密码</p>
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
          登录密码
          <input
            aria-label="登录密码"
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
          {busy ? "登录中…" : "登录"}
        </button>
        <small>测试环境。申请与审批由不同账号操作。</small>
      </form>
    </div>
  );
}
