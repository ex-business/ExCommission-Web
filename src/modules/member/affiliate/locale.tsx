import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import messages from "./messages.json";
export type Locale = "zh-CN" | "en" | "es";
const Context = createContext<{
  locale: Locale;
  setLocale: (v: Locale) => void;
}>({ locale: "zh-CN", setLocale: () => {} });
export function MemberLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const v = localStorage.getItem("affiliate-language");
      return v === "en" || v === "es" ? v : "zh-CN";
    } catch {
      return "zh-CN";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("affiliate-language", locale);
    } catch {}
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <Context.Provider value={{ locale, setLocale }}>
      {children}
    </Context.Provider>
  );
}
export function useMemberLocale() {
  const value = useContext(Context);
  const t = (key: string, values: Record<string, string | number> = {}) => {
    const row = (
      messages as Record<string, { en: string; es: string; "zh-CN"?: string }>
    )[key];
    let text =
      value.locale === "zh-CN"
        ? row?.["zh-CN"] || key
        : row?.[value.locale] || key;
    for (const [k, v] of Object.entries(values))
      text = text.replaceAll("{" + k + "}", String(v));
    return text;
  };
  return { ...value, t };
}
export function MemberLanguage() {
  const { locale, setLocale } = useMemberLocale();
  return (
    <select
      aria-label="Language / 语言 / Idioma"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      <option value="zh-CN">简体中文</option>
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  );
}
