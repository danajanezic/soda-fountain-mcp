import type { ToolResult, CorrelationKey } from "../lib/types.js";
import { CorrelationKeyIndex } from "../lib/correlation-keys.js";

const index = new CorrelationKeyIndex();

export function handleFindCorrelationKeys(params: {
  key?: string;
  datasetId?: string;
  domain?: string;
  crossStateOnly?: boolean;
}): ToolResult {
  if (params.key) {
    const keyDef = index.getKey(params.key);
    if (!keyDef) {
      const available = index.listKeys().map((k) => k.key);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                code: "KEY_NOT_FOUND",
                message: `Unknown correlation key: "${params.key}"`,
                recoverable: true,
                suggestion: `Available keys: ${available.join(", ")}`,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    if (params.datasetId) {
      const correlatable = index.findCorrelatable(params.datasetId, params.key);
      const filtered = { ...keyDef, datasets: correlatable };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { keys: [filtered], domains: index.getDomains() },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { keys: [keyDef], domains: index.getDomains() },
            null,
            2
          ),
        },
      ],
    };
  }

  let keys: CorrelationKey[];

  if (params.datasetId) {
    keys = index.getKeysForDataset(params.datasetId);
  } else if (params.domain) {
    keys = index.getKeysForDomain(params.domain);
  } else if (params.crossStateOnly) {
    keys = index.getCrossStateKeys();
  } else {
    keys = index.listKeys();
  }

  if (params.crossStateOnly && !params.key) {
    keys = keys.filter((k) => k.crossStateJoin);
  }

  if (params.domain) {
    keys = keys.map((k) => ({
      ...k,
      datasets: k.datasets.filter((d) => d.domain === params.domain),
    }));
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ keys, domains: index.getDomains() }, null, 2),
      },
    ],
  };
}
