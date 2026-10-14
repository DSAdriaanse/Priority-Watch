import React, { useState, useEffect } from "react";
import { entities, functions, auth } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioTower } from "lucide-react";
import RepeaterControls from "@/components/RepeaterControls";

export default function DtmfControl() {
  const [repeaters, setRepeaters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await entities.Repeater.list();
      setRepeaters(list || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Repeater Control</h1>
        <p className="text-sm text-gray-400 mt-1">Send DTMF commands to linked repeaters via Allmon3.</p>
      </div>
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-200 flex items-center gap-2">
            <RadioTower className="w-4 h-4 text-sky-400" /> Send Command
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-gray-500">Loading…</div> : <RepeaterControls repeaters={repeaters} />}
        </CardContent>
      </Card>
    </div>
  );
}