import {PagedTable} from '../../components/PagedTable';
import { programRequest } from "./programRequest";
import { type Program, states, modes } from "./programModel";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramHistory } from "./ProgramHistory";
import { useEffect, useRef, useState } from "react";
import type { Session } from "../../auth/Login";
import { ApiError, request } from "../../lib/api";
import type { Config } from "./AffiliateConfig";
import "./programs.css";
// 每个方案独立申请审批，停用与启动同样发布版本；表单不直接改变线上计佣状态。
export function Programs({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [data, setData] = useState<any>({
      versions: [],
      current: [],
      days: [],
      receipts: [],
    }),
    [form, setForm] = useState<Program | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [approval, setApproval] = useState("");
  const [currencies, setCurrencies] = useState<any[]>([]),
    [venues, setVenues] = useState<any[]>([]),
    [members, setMembers] = useState("2"),
    [volumes, setVolumes] = useState<string[]>(["1000", "0", "0"]),
    [estimate, setEstimate] = useState<any>(null);
  const submitKey = useRef<string>("");
  const writable = session.role === "operator";
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  async function load() {
    const r = await request("/v1/affiliate/programs");
    setData(r.data);
  }
  useEffect(() => {
    void guard(async () => {
      await load();
      const [c, v] = await Promise.all([
        request("/v1/affiliate/currencies"),
        request("/v1/affiliate/venue-types"),
      ]);
      setCurrencies(c.data.rows || c.data.currencies || []);
      setVenues(v.data.rows || []);
    });
  }, []);
  function edit(p: Program) {
    setForm(
      structuredClone({
        ...p,
        expected_revision: p.revision || 0,
        effective_from: new Date(Date.now() + 10 * 60000).toISOString(),
        reason: "",
        state: p.state,
      }),
    );
    setPreview(null);
    setEstimate(null);
    setApproval("");
    submitKey.current = "";
  }
  async function create() {
    await guard(async () => {
      const r = await request("/v1/affiliate/config");
      const cfg = r.data.current?.config || r.data.scheduled?.config;
      if (!cfg) throw new Error("请先配置兼容方案，或选择已有方案复制创建。");
      edit({
        program_id: "program-" + Date.now(),
        name: "",
        expected_revision: 0,
        state: "READY",
        effective_from: "",
        reason: "",
        match: {
          sources: [],
          event_types: [],
          member_ids: [],
          mode: "STACK",
          group: "",
          priority: 0,
        },
        config: { ...cfg, enabled: true },
      });
    });
  }
  const patch = (p: Partial<Program>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    setPreview(null);
    setEstimate(null);
    submitKey.current = "";
  };
  const config = (p: Partial<Config>) =>
    form && patch({ config: { ...form.config, ...p } });
  async function check() {
    if (!form) return;
    await guard(async () => {
      const r = await request("/v1/affiliate/programs/preview", {
        key: crypto.randomUUID(),
        method: "POST",
        body: programRequest(form),
        csrf: session.csrf,
      });
      setPreview(r.data);
    });
  }
  async function submit() {
    if (!form) return;
    await guard(async () => {
      if (!submitKey.current) submitKey.current = crypto.randomUUID();
      const r = await request("/v1/affiliate/programs/requests", {
        method: "POST",
        body: programRequest(form),
        csrf: session.csrf,
        key: submitKey.current,
      });
      setApproval(r.data.approval_id);
      setNotice("申请已提交，独立审批通过后按生效时间执行。");
      await load();
    });
  }
  async function simulate() {
    if (!form) return;
    await guard(async () => {
      const { toMinor } = await import("./money");
      const r = await request("/v1/affiliate/programs/simulate", {
        key: crypto.randomUUID(),
        method: "POST",
        csrf: session.csrf,
        body: {
          program: programRequest(form),
          qualified_members: Number(members),
          layer_minor: Array.from(
            { length: form.config.commission_policy?.depth || 3 },
            (_, i) =>
              /^(0|0\.0*)$/.test(volumes[i] || "0")
                ? "0"
                : toMinor(volumes[i] || "0", form.config.currency_scale),
          ),
        },
      });
      setEstimate(r.data.estimate);
    });
  }
  return (
    <div className="programs">
      <section className="panel">
        <div className="program-toolbar">
          <h2>方案发布与运行</h2>
          <button disabled={busy} onClick={() => void guard(load)}>
            刷新
          </button>
          {writable && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void create()}
            >
              新建方案
            </button>
          )}
        </div>
        <p>
          只有运行中的方案新增计算和结算。停止后保留历史及已产生权益，恢复启动不自动补结算旧业务。兼容方案独立运行，可在原配置页停用新增计奖。
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="table-scroll">
          <PagedTable>
            <thead>
              <tr>
                <th>方案</th>
                <th>版本</th>
                <th>状态</th>
                <th>币种</th>
                <th>命中规则</th>
                <th>生效时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.current.map((p: Program) => (
                <tr key={p.program_id}>
                  <td>
                    {p.name}
                    <small>{p.program_id}</small>
                  </td>
                  <td>{p.revision}</td>
                  <td>{states[p.state]}</td>
                  <td>{p.config.currency}</td>
                  <td>
                    {modes[p.match.mode]}
                    {p.match.group &&
                      ` · ${p.match.group} · ${p.match.priority}`}
                  </td>
                  <td>{new Date(p.effective_from).toLocaleString()}</td>
                  <td>
                    <button onClick={() => edit(p)}>
                      {writable ? "查看 / 编辑" : "查看"}
                    </button>
                    {writable && (
                      <button
                        onClick={() => {
                          edit(p);
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  program_id: "program-" + Date.now(),
                                  name: p.name + "（副本）",
                                  expected_revision: 0,
                                  revision: undefined,
                                  state: "READY",
                                }
                              : f,
                          );
                        }}
                      >
                        复制
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </PagedTable>
          {!data.current.length && (
            <p>暂无生效方案。已发布的未来版本可在下方查看。</p>
          )}
        </div>
      </section>
      {form && (
        <ProgramEditor
          form={form}
          writable={writable}
          busy={busy}
          patch={patch}
          config={config}
          currencies={currencies}
          venues={venues}
          check={check}
          submit={submit}
          onApproval={onApproval}
          approval={approval}
          preview={preview}
          members={members}
          setMembers={setMembers}
          volumes={volumes}
          setVolumes={setVolumes}
          simulate={simulate}
          estimate={estimate}
        />
      )}
      <ProgramHistory data={data} onApproval={onApproval} />
    </div>
  );
}
