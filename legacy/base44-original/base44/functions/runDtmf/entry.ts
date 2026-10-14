import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

const DTMF_RE = /^[0-9A-D*#]{1,24}$/;
const NODE_RE = /^[0-9]+$/;

// Sends a configured DTMF command to a repeater's Allmon3 node.
// Input is only repeaterId + commandId — never a raw DTMF string or node number.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Authorize: caller must be an admin or operator volunteer.
    const vols: any[] = await base44.asServiceRole.entities.Volunteer.filter({ email: user.email });
    const volunteer = vols && vols[0];
    if (!volunteer || !['admin', 'operator'].includes(volunteer.role)) {
      return Response.json({ error: 'Forbidden: operators and admins only' }, { status: 403 });
    }

    const body: any = await req.json().catch(() => ({}));
    const { repeaterId, commandId } = body || {};
    if (!repeaterId || !commandId) {
      return Response.json({ error: 'repeaterId and commandId are required' }, { status: 400 });
    }

    // Load repeater and validate its node number.
    const repeater = await base44.asServiceRole.entities.Repeater.get(repeaterId).catch(() => null);
    if (!repeater) return Response.json({ error: 'Repeater not found' }, { status: 404 });
    const node = (repeater.node_number || '').toString().trim();
    if (!NODE_RE.test(node)) {
      return Response.json({ error: 'Repeater has no valid node number' }, { status: 400 });
    }

    // Load command; reject if missing or disabled, and re-validate the DTMF.
    const command = await base44.asServiceRole.entities.DtmfCommand.get(commandId).catch(() => null);
    if (!command) return Response.json({ error: 'Command not found' }, { status: 404 });
    if (command.enabled === false) {
      return Response.json({ error: 'Command is disabled' }, { status: 400 });
    }
    const dtmf = (command.dtmf || '').toString().trim();
    if (!DTMF_RE.test(dtmf)) {
      return Response.json({ error: 'Invalid DTMF sequence' }, { status: 400 });
    }

    // Read Allmon3 base URL + username from settings; password from the secret.
    const settingsList = await base44.asServiceRole.entities.Settings.list();
    const settings: any = settingsList[0] || {};
    const base = (settings.allmon3_base_url || '').toString().trim().replace(/\/+$/, '');
    const allmonUser = (settings.allmon3_username || '').toString().trim();
    const pass = (secrets.get('ALLMON_PASS') || '').toString();
    if (!base || !allmonUser || !pass) {
      return Response.json(
        { error: 'Allmon3 is not configured (base URL, username, or password missing)' },
        { status: 500 }
      );
    }

    let output = '';
    let ok = false;
    let errorMsg = '';

    try {
      // 1. Login and capture the session cookie.
      const loginRes = await fetch(`${base}/master/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user: allmonUser, pass, action: 'login' }).toString(),
        signal: AbortSignal.timeout(15000),
      });

      if (!loginRes.ok) {
        errorMsg = `Allmon3 login HTTP ${loginRes.status}`;
      } else {
        let cookie = '';
        const hdr: any = loginRes.headers;
        const cookies: string[] = typeof hdr.getSetCookie === 'function' ? hdr.getSetCookie() : [];
        if (cookies && cookies.length) {
          cookie = cookies[0].split(';')[0];
        } else {
          const sc = loginRes.headers.get('set-cookie');
          if (sc) cookie = sc.split(';')[0];
        }
        if (!cookie) {
          errorMsg = 'Allmon3 login failed';
        } else {
          // 2. Send the command.
          const cmdRes = await fetch(`${base}/master/cmd`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': cookie,
            },
            body: new URLSearchParams({ node, cmd: `rpt fun ${node} ${dtmf}` }).toString(),
            signal: AbortSignal.timeout(15000),
          });

          if (!cmdRes.ok) {
            errorMsg = `Allmon3 cmd HTTP ${cmdRes.status}`;
          } else {
            const cmdJson: any = await cmdRes.json().catch(() => null);
            if (cmdJson && cmdJson.SUCCESS != null) {
              ok = true;
              const val = cmdJson.SUCCESS;
              const b64 = typeof val === 'string' ? val : (val && (val.output || val.data || val.text)) || '';
              try { output = atob(b64); } catch { output = String(b64 || ''); }
              if (!output) output = 'Command accepted';
            } else if (cmdJson && cmdJson.SECURITY != null) {
              errorMsg = 'Allmon3 security error';
            } else if (cmdJson && cmdJson.ERROR != null) {
              errorMsg = typeof cmdJson.ERROR === 'string' ? cmdJson.ERROR : 'Allmon3 error';
            } else {
              errorMsg = 'Unexpected Allmon3 response';
            }
          }
        }
      }
    } catch (e: any) {
      errorMsg = e.message || 'Allmon3 request failed';
    }

    // 3. Log every attempt.
    const result = ok ? 'success' : 'error';
    const logOutput = ok ? output : errorMsg;
    try {
      await base44.asServiceRole.entities.DtmfLog.create({
        user_email: user.email || '',
        user_name: volunteer.name || user.full_name || user.email || '',
        repeater_name: repeater.name || '',
        node,
        command_name: command.name || '',
        dtmf,
        result,
        output: logOutput || '',
      });
    } catch {}

    if (ok) return Response.json({ ok: true, output });
    return Response.json({ ok: false, error: errorMsg || 'Unknown error' }, { status: 502 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}