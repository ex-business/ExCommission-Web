import { useEffect, useState } from "react";
import { request } from "../lib/api";
export type Session = {
  role: "operator" | "approver" | "member" | "viewer";
  subject: string;
  csrf: string;
  ops?: boolean;
  require_otp?: boolean;
  name?: string;
  site_id?: string;
  sites?: { id: string; name: string }[];
};
export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [role, setRole] = useState(
      new URLSearchParams(window.location.search).get("role") === "member"
        ? "member"
        : "operator",
    ),
    [password, setPassword] = useState(""),
    [username, setUsername] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState<{
      ops: boolean;
      require_otp: boolean;
    } | null>(null),
    [otp, setOtp] = useState("");
  useEffect(() => {
    let active = true;
    setSettings(null);
    setError("");
    request("/auth/config?role=" + encodeURIComponent(role))
      .then((r) => {
        if (active) setSettings(r.data);
      })
      .catch(() => {
        if (active) setError("登录设置暂不可用，请稍后刷新");
      });
    return () => {
      active = false;
    };
  }, [role]);
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
                  body: {
                    role,
                    password,
                    ...(role === "member" || settings?.ops ? { username } : {}),
                    ...(role !== "member" && settings?.require_otp
                      ? { otp }
                      : {}),
                  },
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
        <h2>账号登录</h2>
        <p className="muted">请输入账号和密码</p>
        <label className="field">
          登录身份
          <select
            aria-label="登录身份"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="operator">
              {settings?.ops ? "运营账号" : "业务申请人"}
            </option>
            {!settings?.ops && <option value="approver">独立审批人</option>}
            <option value="member">会员</option>
          </select>
        </label>
        {(role === "member" || settings?.ops) && (
          <label className="field">
            {role === "member" ? "会员账号" : "运营账号"}
            <input
              aria-label={role === "member" ? "会员账号" : "运营账号"}
              autoComplete="username"
              placeholder={
                role === "member"
                  ? "会员项目中注册的邮箱"
                  : "运营管理后台创建的账号"
              }
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
        )}
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
        {role !== "member" && settings?.require_otp && (
          <label className="field">
            动态验证码
            <input
              aria-label="动态验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy || !settings}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
