import { useEffect, useState } from "react";
export type ColorTheme = "sap" | "sap-horizon" | "simple" | "ibm";
const colorKey = "ec-admin-color-theme-v1";
function readColorTheme(): ColorTheme {
  try {
    const value = localStorage.getItem(colorKey);
    if (
      value === "sap" ||
      value === "sap-horizon" ||
      value === "simple" ||
      value === "ibm"
    )
      return value;
  } catch {}
  // SAP为产品默认配色；旧default值或无偏好均自然迁移，显式IBM偏好仍保留。
  return "sap";
}
export type Appearance = "light" | "dark" | "system";
const key = "ec-admin-appearance-v1";
// 外观偏好仅保存在浏览器，不写入业务配置；存储受限时仍允许当前页面切换。
function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(key);
    if (value === "light" || value === "dark") return value;
  } catch {}
  return "system";
}
export function useAppearance() {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(readColorTheme);
  // 品牌配色和明暗偏好分别持久化，切换配色不会覆盖已有明暗选择。
  useEffect(() => {
    try {
      localStorage.setItem(colorKey, colorTheme);
    } catch {}
  }, [colorTheme]);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemDark(media.matches);
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, appearance);
    } catch {}
  }, [appearance]);
  return {
    colorTheme,
    setColorTheme,
    appearance,
    setAppearance,
    resolved:
      appearance === "system" ? (systemDark ? "dark" : "light") : appearance,
  };
}
