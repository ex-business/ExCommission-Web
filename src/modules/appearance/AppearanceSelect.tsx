import type { Appearance, ColorTheme } from "./useAppearance";
export function AppearanceSelect({
  value,
  onChange,
  theme,
  onThemeChange,
}: {
  value: Appearance;
  onChange: (next: Appearance) => void;
  theme: ColorTheme;
  onThemeChange: (next: ColorTheme) => void;
}) {
  return (
    <>
      <label className="appearance-control">
        <span>主题</span>
        <select
          aria-label="主题设置"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ColorTheme)}
        >
          <option value="sap">SAP 经典蓝灰（默认）</option>
          <option value="simple">简洁蓝灰</option>
          <option value="sap-horizon">SAP Horizon</option>
          <option value="ibm">IBM Carbon</option>
        </select>
      </label>
      <label className="appearance-control">
        <span>明暗</span>
        <select
          aria-label="明暗模式"
          value={value}
          onChange={(e) => onChange(e.target.value as Appearance)}
        >
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </label>
    </>
  );
}
