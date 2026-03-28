import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, ToolResult } from "../lib/types.js";

export async function handleGetDatasetSchema(
  client: SocrataClient,
  params: { datasetId: string }
): Promise<ToolResult> {
  try {
    const schema = await client.getMetadata(params.datasetId);
    return {
      content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
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
            message: `Could not reach data.oregon.gov — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
