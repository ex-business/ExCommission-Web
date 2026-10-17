import { Sidebar } from "./layout/Sidebar";
import { AppearanceSelect } from "../modules/appearance/AppearanceSelect";
import { useAppearance } from "../modules/appearance/useAppearance";
import "../modules/appearance/appearance.css";
import "../modules/appearance/palettes.css";
import "../modules/appearance/sap-classic.css";
import { useEffect, useState, type ReactNode } from "react";
import { groups, type Operation } from "../catalog";
import { NavigationIcon } from "./NavigationIcon";
import type { Session } from "../auth/Login";
export function Layout({
  op,
  session,
  onSelect,
  onLogout,
  children,
}: {
  op: Operation;
  session: Session;
  onSelect: (o: Operation) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { appearance, setAppearance, resolved, colorTheme, setColorTheme } =
    useAppearance();
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(op.group);
  // 导航展开状态与业务选择分离，折叠菜单不跳页、不清空尚未提交的表单。
  useEffect(() => {
    setExpandedGroup(op.group);
  }, [op.group]);
  const group = groups.find((g) => g.id === op.group)!;
  return (
    <div
      className={"app-shell" + (menuCollapsed ? " menu-collapsed" : "")}
      data-appearance={resolved}
      data-color-theme={colorTheme === "sap-horizon" ? "sap" : colorTheme}
      data-sap-style={colorTheme === "sap" ? "classic" : "horizon"}
    >
      <Sidebar
        op={op}
        collapsed={menuCollapsed}
        expandedGroup={expandedGroup}
        brandTitle={session.ops ? "代理业务" : "佣金分润"}
        onSelect={onSelect}
        onToggleGroup={(id) => {
          // 展开菜单不触发业务导航，保留当前页面与未提交草稿。
          if (menuCollapsed) {
            setMenuCollapsed(false);
            setExpandedGroup(id);
          } else setExpandedGroup((current) => (current === id ? null : id));
        }}
      />
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-location">
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuCollapsed ? "展开菜单" : "折叠菜单"}
              aria-expanded={!menuCollapsed}
              aria-controls="business-navigation"
              title={menuCollapsed ? "展开菜单" : "折叠菜单"}
              onClick={() => setMenuCollapsed((current) => !current)}
            >
              <NavigationIcon name={menuCollapsed ? "expand" : "collapse"} />
            </button>
            管理后台 <span className="muted"> / </span> {group.name}
          </span>
          <div style={session.ops ? { whiteSpace: "nowrap" } : undefined}>
            <AppearanceSelect
              value={appearance}
              onChange={setAppearance}
              theme={colorTheme}
              onThemeChange={setColorTheme}
            />
            {session.ops ? (
              <select
                style={{
                  width: "auto",
                  maxWidth: "min(40vw, 240px)",
                  flexShrink: 0,
                }}
                aria-label="当前站点"
                value={session.site_id || ""}
                onChange={async (e) => {
                  // 切站由服务端校验并更新独立业务会话，刷新清除原站点结果和表单。
                  const r = await fetch("/auth/site", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": session.csrf,
                    },
                    body: JSON.stringify({ site_id: e.target.value }),
                  });
                  if (r.ok) location.reload();
                  else window.alert("切换站点失败，请重新登录");
                }}
              >
                {(session.sites || []).map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="scope-pill">本地应用</span>
            )}
            <span className="avatar">
              {session.ops
                ? session.name?.slice(0, 1) || "运"
                : session.role === "operator"
                  ? "申"
                  : "审"}
            </span>
            <span>
              {session.ops
                ? session.name
                : session.role === "operator"
                  ? "业务申请人"
                  : "独立审批人"}
            </span>
            <button className="link-button" onClick={onLogout}>
              退出 / 切换身份
            </button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
