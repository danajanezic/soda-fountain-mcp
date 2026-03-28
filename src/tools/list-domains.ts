import type { SocrataClient } from "../lib/socrata-client.js";
import type { ToolResult } from "../lib/types.js";

export function handleListDomains(client: SocrataClient): ToolResult {
  const domains = client.listDomains();
  return {
    content: [{ type: "text", text: JSON.stringify({ domains }, null, 2) }],
  };
}
