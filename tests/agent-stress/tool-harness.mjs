/**
 * Minimal tool harness for naive agent testing.
 * Usage: import and call tools directly.
 */

import { SocrataClient } from "../../dist/lib/socrata-client.js";
import { handleListDomains } from "../../dist/tools/list-domains.js";
import { handleGetDomainCategories } from "../../dist/tools/get-domain-categories.js";
import { handleSearchDatasets } from "../../dist/tools/search-datasets.js";
import { handleGetDatasetSchema } from "../../dist/tools/get-dataset-schema.js";
import { handleQueryDataset } from "../../dist/tools/query-dataset.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);

function parse(result) {
  return JSON.parse(result.content[0].text);
}

export async function listDomains() {
  return parse(handleListDomains(client));
}

export async function getDomainCategories(domain) {
  return parse(await handleGetDomainCategories(client, { domain }));
}

export async function searchDatasets(domain, query, category) {
  return parse(await handleSearchDatasets(client, { domain, query, category }));
}

export async function getDatasetSchema(domain, datasetId) {
  return parse(await handleGetDatasetSchema(client, { domain, datasetId }));
}

export async function queryDataset(domain, datasetId, params) {
  const result = await handleQueryDataset(client, {
    domain,
    datasetId,
    limit: 100,
    offset: 0,
    ...params,
  });
  const text = result.content[0].text;
  // Could be markdown string or JSON
  try {
    return { ...JSON.parse(text), isError: result.isError };
  } catch {
    return { text, isError: result.isError };
  }
}
