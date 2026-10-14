import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import * as XLSX from 'npm:xlsx@0.18.5';
import { parseRepeaterRow, parseGuidanceRow } from '../../shared/workbook.ts';

// Imports Repeaters and Guidance from an uploaded .xlsx workbook.
// Rows are matched by name (Repeaters) or title (Guidance): a match updates the
// existing record, otherwise a new record is created. Records not present in the
// sheet are left untouched. Expects a signed URL to the uploaded file.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { file_url } = body || {};
    if (!file_url) return Response.json({ error: "file_url is required" }, { status: 400 });

    const res = await fetch(file_url);
    if (!res.ok) return Response.json({ error: "Could not download the uploaded file" }, { status: 502 });
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

    const summary: any = {
      repeaters: { updated: 0, created: 0, skipped: 0 },
      guidance: { updated: 0, created: 0, skipped: 0 }
    };

    if (wb.SheetNames.includes("Repeaters")) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets["Repeaters"], { defval: "" });
      const existing = await base44.asServiceRole.entities.Repeater.list("-created_date", 1000);
      for (const row of rows) {
        const fields = parseRepeaterRow(row);
        if (!fields.name) { summary.repeaters.skipped++; continue; }
        const match = existing.find((r: any) => (r.name || "").toLowerCase() === fields.name.toLowerCase());
        if (match) {
          await base44.asServiceRole.entities.Repeater.update(match.id, fields);
          summary.repeaters.updated++;
        } else {
          await base44.asServiceRole.entities.Repeater.create(fields);
          summary.repeaters.created++;
        }
      }
    }

    if (wb.SheetNames.includes("Guidance")) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets["Guidance"], { defval: "" });
      const existing = await base44.asServiceRole.entities.GuidanceScript.list("-created_date", 1000);
      for (const row of rows) {
        const fields = parseGuidanceRow(row);
        if (!fields.title) { summary.guidance.skipped++; continue; }
        const match = existing.find((g: any) => (g.title || "").toLowerCase() === fields.title.toLowerCase());
        if (match) {
          await base44.asServiceRole.entities.GuidanceScript.update(match.id, fields);
          summary.guidance.updated++;
        } else {
          await base44.asServiceRole.entities.GuidanceScript.create(fields);
          summary.guidance.created++;
        }
      }
    }

    return Response.json({ status: "ok", summary });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}