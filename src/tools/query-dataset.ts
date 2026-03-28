import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, SoqlParams, ToolResult } from "../lib/types.js";

export async function handleQueryDataset(
  client: SocrataClient,
  params: {
    datasetId: string;
    select?: string;
    where?: string;
    group?: string;
    having?: string;
    order?: string;
    limit: number;
    offset: number;
    search?: string;
  }
): Promise<ToolResult> {
  try {
    const soqlParams: SoqlParams = {
      select: params.select,
      where: params.where,
      group: params.group,
      having: params.having,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
      search: params.search,
    };

    const response = await client.queryDataset(params.datasetId, soqlParams);
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
