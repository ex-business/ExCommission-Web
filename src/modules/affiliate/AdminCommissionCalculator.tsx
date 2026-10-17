import { useEffect, useState } from "react";
import { request } from "../../lib/api";
import { CommissionCalculator } from "../member/affiliate/CommissionCalculator";

export function AdminCommissionCalculator() {
  const [state, setState] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request("/v1/affiliate/config")
      .then((r) => {
        if (active) setState(r.data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!state) return <p>正在读取方案…</p>;
  if (!state.current)
    return <p>本站暂无已生效方案，请先在代理配置中提交并完成独立审批。</p>;
  const c = state.current.config;
  return (
    <CommissionCalculator
      key={state.current.revision}
      endpoint="/v1/affiliate/calculator"
      currency={c.currency}
      scale={c.currency_scale}
      depth={c.commission_policy?.depth || 3}
      revision={state.current.revision}
    />
  );
}
