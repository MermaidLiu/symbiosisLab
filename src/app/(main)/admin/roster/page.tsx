"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api/client";
import { ResearchGroupRosterEntry } from "@/types";

function parseBulkText(text: string): { name: string; phone: string; groupName?: string }[] {
  const out: { name: string; phone: string; groupName?: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[,，\t|]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    out.push({
      name: parts[0],
      phone: parts[1],
      groupName: parts[2] || undefined,
    });
  }
  return out;
}

export default function AdminRosterPage() {
  const { user } = useAuth();
  const [roster, setRoster] = useState<ResearchGroupRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ id: "", name: "", phone: "", groupName: "", note: "" });
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.researchGroupRoster();
      setRoster(data.roster);
    } catch {
      setError("加载名单失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return roster;
    return roster.filter(
      (e) =>
        e.name.toLowerCase().includes(key) ||
        e.phone.includes(key) ||
        (e.groupName ?? "").toLowerCase().includes(key)
    );
  }, [roster, q]);

  if (!user?.roles.includes("super_admin")) {
    return <div className="p-6 text-sm text-red-600">403</div>;
  }

  async function saveOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const data = await api.upsertResearchGroupRoster({
        id: form.id || undefined,
        name: form.name,
        phone: form.phone,
        groupName: form.groupName || undefined,
        note: form.note || undefined,
      });
      setRoster(data.roster);
      setForm({ id: "", name: "", phone: "", groupName: "", note: "" });
      setMsg("已保存");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === "phone_exists" ? "该手机号已在名单中（请编辑原条目）" : "保存失败，请检查姓名与手机号");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("确定从名单中删除该人员？")) return;
    setBusy(true);
    try {
      const data = await api.deleteResearchGroupRoster(id);
      setRoster(data.roster);
      setMsg("已删除");
    } catch {
      setError("删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function importBulk() {
    const entries = parseBulkText(bulk);
    if (entries.length === 0) {
      setError("请按「姓名,手机号」每行一条填写");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api.bulkUpsertResearchGroupRoster(entries);
      setRoster(data.roster);
      setBulk("");
      setMsg(`导入完成：新增 ${data.added}，更新 ${data.updated}，跳过 ${data.skipped}`);
    } catch {
      setError("批量导入失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="课题组名单"
        subtitle="录入课题组实际人员（姓名+手机号）。学生/技术员首次实名认证须与名单一致，否则无法使用系统。"
      />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {msg ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

        <Card>
          <h3 className="mb-3 font-semibold text-thu">{form.id ? "编辑名单" : "添加人员"}</h3>
          <form onSubmit={(e) => void saveOne(e)} className="grid gap-3 md:grid-cols-2">
            <Input
              label="姓名 *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="手机号 *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
              placeholder="11 位手机号"
            />
            <Input
              label="课题组 / 分组"
              value={form.groupName}
              onChange={(e) => setForm({ ...form, groupName: e.target.value })}
            />
            <Input
              label="备注"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={busy}>
                {form.id ? "保存修改" : "添加到名单"}
              </Button>
              {form.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm({ id: "", name: "", phone: "", groupName: "", note: "" })}
                >
                  取消编辑
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold text-thu">批量导入</h3>
          <p className="mb-3 text-xs text-lab-muted">
            每行一条：姓名,手机号[,课题组]。支持逗号 / 制表符 / 竖线分隔。同手机号会覆盖姓名。
          </p>
          <textarea
            className="mb-3 w-full rounded-lg border border-lab-border bg-white p-3 font-mono text-sm"
            rows={5}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"张三,13800138000,微生物组\n李四,13900139000"}
          />
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void importBulk()}>
            导入名单
          </Button>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-thu">
              当前名单（{filtered.length}/{roster.length}）
            </h3>
            <Input
              label=""
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名 / 手机号 / 课题组"
              className="max-w-xs"
            />
          </div>
          {loading ? (
            <p className="text-sm text-lab-muted">加载中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-lab-muted">暂无名单，请先添加或导入。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-lab-border text-xs text-lab-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">姓名</th>
                    <th className="py-2 pr-3 font-medium">手机号</th>
                    <th className="py-2 pr-3 font-medium">课题组</th>
                    <th className="py-2 pr-3 font-medium">备注</th>
                    <th className="py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-lab-border/60">
                      <td className="py-2.5 pr-3 font-medium text-thu">{e.name}</td>
                      <td className="py-2.5 pr-3 font-mono">{e.phone}</td>
                      <td className="py-2.5 pr-3 text-lab-text">{e.groupName || "—"}</td>
                      <td className="py-2.5 pr-3 text-lab-muted">{e.note || "—"}</td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({
                                id: e.id,
                                name: e.name,
                                phone: e.phone,
                                groupName: e.groupName || "",
                                note: e.note || "",
                              })
                            }
                          >
                            编辑
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void remove(e.id)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
