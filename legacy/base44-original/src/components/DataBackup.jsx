import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Export/import Repeaters + Guidance as a multi-sheet .xlsx workbook.
export default function DataBackup() {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke("exportWorkbook", {});
      const { file, filename, exported } = res.data;
      // decode base64 -> blob -> download
      const binary = atob(file);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "gmrs-data.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `${exported?.repeaters || 0} repeaters and ${exported?.guidance || 0} guidance scripts exported.` });
    } catch (e) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      // Upload privately, then sign a short-lived URL the backend can fetch.
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
      const res = await base44.functions.invoke("importWorkbook", { file_url: signed_url });
      const s = res.data?.summary;
      toast({
        title: "Import complete",
        description: `Repeaters: ${s?.repeaters?.created || 0} added, ${s?.repeaters?.updated || 0} updated. Guidance: ${s?.guidance?.created || 0} added, ${s?.guidance?.updated || 0} updated.`,
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