import React, { useState, useRef } from "react";
import { createGuidance, createRepeater, listGuidance, listRepeaters, updateGuidance, updateRepeater } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  REPEATER_COLUMNS, GUIDANCE_COLUMNS, serializeRepeater, serializeGuidance, parseRepeaterRow, parseGuidanceRow,
} from "@/features/settings/workbook";

// Export/import Repeaters + Guidance as a two-sheet .xlsx workbook.
// Runs entirely in the browser: the file never goes to a server, and the server never
// fetches a URL on the user's behalf.
// Excel backup on the Settings page. Export writes Repeaters and Guidance to a .xlsx
// file. Import reads one back: a row whose name (repeaters) or title (guidance)
// matches an existing record updates it; otherwise a new record is created.
// Nothing is deleted by an import. Column layout lives in lib/workbook.js.
export default function DataBackup() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const [repeaters, guidance] = await Promise.all([listRepeaters(), listGuidance()]);

      const wb = new ExcelJS.Workbook();
      const addSheet = (name, columns, rows) => {
        const ws = wb.addWorksheet(name);
        ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
        rows.forEach((r) => ws.addRow(r));
        ws.getRow(1).font = { bold: true };
      };
      addSheet("Repeaters", REPEATER_COLUMNS, repeaters.map(serializeRepeater));
      addSheet("Guidance", GUIDANCE_COLUMNS, guidance.map(serializeGuidance));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gmrs-data.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `${repeaters.length} repeaters and ${guidance.length} guidance scripts exported.` });
    } catch (e) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const readSheet = (ws) => {
    if (!ws) return null;
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value ?? "").trim(); });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, col) => {
        if (!h) return;
        const v = row.getCell(col).value;
        obj[h] = v && typeof v === "object" && "text" in v ? v.text : v;
      });
      rows.push(obj);
    });
    return rows;
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      const summary = { repeaters: { updated: 0, created: 0, skipped: 0 }, guidance: { updated: 0, created: 0, skipped: 0 } };

      const repRows = readSheet(wb.getWorksheet("Repeaters"));
      if (repRows) {
        const existing = await listRepeaters();
        for (const row of repRows) {
          const fields = parseRepeaterRow(row);
          if (!fields.name) { summary.repeaters.skipped++; continue; }
          const match = existing.find((r) => (r.name || "").toLowerCase() === fields.name.toLowerCase());
          if (match) { await updateRepeater(match.id, fields); summary.repeaters.updated++; }
          else { await createRepeater(fields); summary.repeaters.created++; }
        }
      }

      const guideRows = readSheet(wb.getWorksheet("Guidance"));
      if (guideRows) {
        const existing = await listGuidance();
        for (const row of guideRows) {
          const fields = parseGuidanceRow(row);
          if (!fields.title) { summary.guidance.skipped++; continue; }
          const match = existing.find((g) => (g.title || "").toLowerCase() === fields.title.toLowerCase());
          if (match) { await updateGuidance(match.id, fields); summary.guidance.updated++; }
          else { await createGuidance(fields); summary.guidance.created++; }
        }
      }

      const s = summary;
      toast({
        title: "Import complete",
        description: `Repeaters: ${s.repeaters.created} added, ${s.repeaters.updated} updated. Guidance: ${s.guidance.created} added, ${s.guidance.updated} updated.`,
      });
    } catch (err) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-gray-200 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Data Backup (Excel)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-400">
          Export your Repeaters and Guidance scripts to a single Excel workbook for offline editing, then import the edited file back. Rows are matched by repeater name or guidance title: existing records update, new rows create records. Records not in the file are left untouched. Array fields (steps, questions, triage flow) are stored as JSON text in their cells.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport} disabled={exporting || importing} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting…</> : <><Download className="w-4 h-4 mr-2" /> Export to Excel</>}
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={exporting || importing} variant="outline" className="bg-gray-900 border-gray-700 text-gray-200">
            {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4 mr-2" /> Import from Excel</>}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
        </div>
      </CardContent>
    </Card>
  );
}
