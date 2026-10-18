// DTMF commands (preset tones sent to a repeater node) and the log of what was sent.
import { table, post } from "./records";

const commands = table("dtmf_commands");
const logs = table("dtmf_logs");

// Management screen: every command in display order.
export const listDtmfCommands = () => commands.list({ sort: "order", limit: 200 });
// Control panel: only the enabled ones.
export const listEnabledDtmfCommands = () => commands.list({ sort: "order", limit: 100, where: { enabled: true } });
export const createDtmfCommand = commands.create;
export const updateDtmfCommand = commands.update;
export const deleteDtmfCommand = commands.remove;
// Save several changes at once: [{ id, ...fields }]
export const updateDtmfCommands = (items) => Promise.all(items.map(({ id, ...rest }) => commands.update(id, rest)));

export const listDtmfLog = () => logs.list({ limit: 200 });

// Ask the server to send one command to one repeater. Returns the server's JSON.
export const runDtmf = (body) => post("/api/pw/dtmf/run", body);
