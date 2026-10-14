import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import * as XLSX from 'npm:xlsx@0.18.5';
import {
  REPEATER_COLUMNS, GUIDANCE_COLUMNS,
  serializeRepeater, serializeGuidance
} from '../../shared/workbook.ts';

// Exports all Repeaters and GuidanceScripts as a multi-sheet .xlsx workbook.
// Returns the file as base64 so the frontend can trigger a download.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [repeaters, guidance] = await Promise.all([
      base44.asServiceRole.entities.Repeater.list("-created_date", 1000),
      base44.asServiceRole.entities.GuidanceScript.list("-created_date", 1000),
    ]);

    const wb = XLSX.utils.book_new();

    const repRows = repeaters.map(serializeRepeater);
    const repWs = XLSX.utils.json_to_sheet(repRows.length ? repRows : [{}], { header: REPEATER_COLUMNS });
    XLSX.utils.book_append_sheet(wb, repWs, "Repeaters");

    const gRows = guidance.map(serializeGuidance);
    const gWs = XLSX.utils.json_to_sheet(gRows.length ? gRows : [{}], { header: GUIDANCE_COLUMNS });
    XLSX.utils.book_append_sheet(wb, gWs, "Guidance");

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    // base64-encode in chunks to avoid call-stack limits on large workbooks
    let binary = "";
    const bytes = new Uint8Array(out);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
    }
    const b64 = btoa(binary);

    return Response.json({
      file: b64,
      filename: "gmrs-data.xlsx",
      exported: { repeaters: repeaters.length, guidance: guidance.length }
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}