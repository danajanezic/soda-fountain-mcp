import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, ToolResult } from "../lib/types.js";

export async function handleSearchDatasets(
  client: SocrataClient,
  params: { domain: string; query?: string; category?: string }
): Promise<ToolResult> {
  try {
    const response = await client.searchCatalog({
      domain: params.domain,
      query: params.query,
      category: params.category,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  } catch (err) {
    const socrataErr = err as SocrataError;
    if (socrataErr.error) {
      return {
        content: [{ type: "text", text: JSON.stringify(socrataErr, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "NETWORK_ERROR",
            message: `Could not reach ${params.domain} — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
