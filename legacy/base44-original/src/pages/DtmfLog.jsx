import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function DtmfLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await base44.entities.DtmfLog.list("-created_date", 200);
      setLogs(list || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Command Log</h1>
        <p className="text-sm text-gray-400 mt-1">Read-only activity log of every DTMF command sent.</p>
      </div>
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-200 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-gray-400" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-gray-500">No commands logged yet.</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {logs.map((l) => (
                <div key={l.id} className="border-l-2 pl-3 py-1.5 text-sm" style={{ borderColor: l.result === "success" ? "#10b981" : "#ef4444" }}>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{new Date(l.created_date).toLocaleString()}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-300">{l.user_name || l.user_email}</span>
                    <span className={`text-[10px] uppercase ${l.result === "success" ? "text-emerald-400" : "text-red-400"}`}>{l.result}</span>
                  </div>
                  <div className="text-gray-200">
                    {l.command_name} → {l.repeater_name} (node {l.node}) <span className="font-mono text-gray-500">{l.dtmf}</span>
                  </div>
                  {l.output && <div className="text-xs text-gray-400 mt-0.5">{l.output}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}