"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getLogs, setCachePartial } from "@/lib/storage/db";
import { api } from "@/lib/api/client";
import { AuditLog } from "@/types";

export default function LogsPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [rawLogs, setRawLogs] = useState<AuditLog[]>([]);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  useEffect(() => {
    (async () => {
      try {
        const { logs } = await api.logs();
        setCachePartial({ logs });
        setRawLogs(logs);
      } catch {
        setRawLogs(getLogs());
      }
    })();
  }, []);

  const logs = useMemo(() => {
    // Server already scopes instrument managers to their own instruments
    let all = [...rawLogs];
    if (!user) return [];
    if (filter !== "all") all = all.filter((l) => l.entityType === filter);
    return all;
  }, [user, filter, rawLogs]);

  return (
    <>
      <PageHeader title={t.logs.title} subtitle={t.logs.subtitle} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 max-w-xs">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t.logs.filterAll}</option>
            <option value="instrument">instrument</option>
            <option value="instrument_training">instrument_training</option>
            <option value="instrument_repair">instrument_repair</option>
            <option value="animal">animal</option>
            <option value="booking">booking</option>
            <option value="auth">auth</option>
            <option value="user">user</option>
          </Select>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-lab-border text-lab-muted">
                <th className="py-2 pr-3">{t.logs.time}</th>
                <th className="py-2 pr-3">{t.logs.user}</th>
                <th className="py-2 pr-3">{t.logs.action}</th>
                <th className="py-2 pr-3">{t.logs.entity}</th>
                <th className="py-2">{t.logs.details}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-lab-border/40 hover:bg-thu-muted/20">
                  <td className="whitespace-nowrap py-2 pr-3 text-lab-muted">
                    {new Date(log.timestamp).toLocaleString(localeStr)}
                  </td>
                  <td className="py-2 pr-3 text-thu">{log.userName}</td>
                  <td className="py-2 pr-3">{log.action}</td>
                  <td className="py-2 pr-3">{log.entityType}</td>
                  <td className="py-2 text-lab-text">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
