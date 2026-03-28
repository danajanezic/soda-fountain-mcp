import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CorrelationKeySeedSchema,
  type CorrelationKeySeed,
  type CorrelationKey,
  type CorrelationDatasetEntry,
  type DomainEntry,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, "../data/correlation-keys.json");

export class CorrelationKeyIndex {
  private seed: CorrelationKeySeed;
  private keyMap: Map<string, CorrelationKey>;
  private datasetIndex: Map<string, CorrelationKey[]>;
  private domainIndex: Map<string, CorrelationKey[]>;

  constructor() {
    const raw = readFileSync(SEED_PATH, "utf8");
    this.seed = CorrelationKeySeedSchema.parse(JSON.parse(raw));
    this.keyMap = new Map();
    this.datasetIndex = new Map();
    this.domainIndex = new Map();

    for (const key of this.seed.keys) {
      this.keyMap.set(key.key, key);
      for (const ds of key.datasets) {
        if (!this.datasetIndex.has(ds.id)) {
          this.datasetIndex.set(ds.id, []);
        }
        this.datasetIndex.get(ds.id)!.push(key);

        if (!this.domainIndex.has(ds.domain)) {
          this.domainIndex.set(ds.domain, []);
        }
        const domainKeys = this.domainIndex.get(ds.domain)!;
        if (!domainKeys.includes(key)) {
          domainKeys.push(key);
        }
      }
    }
  }

  listKeys(): CorrelationKey[] {
    return this.seed.keys;
  }

  getKey(keyName: string): CorrelationKey | undefined {
    return this.keyMap.get(keyName);
  }

  getKeysForDataset(datasetId: string): CorrelationKey[] {
    return this.datasetIndex.get(datasetId) ?? [];
  }

  getKeysForDomain(domain: string): CorrelationKey[] {
    return this.domainIndex.get(domain) ?? [];
  }

  getCrossStateKeys(): CorrelationKey[] {
    return this.seed.keys.filter((k) => k.crossStateJoin);
  }

  findCorrelatable(datasetId: string, keyName: string): CorrelationDatasetEntry[] {
    const key = this.keyMap.get(keyName);
    if (!key) return [];
    const hasDataset = key.datasets.some((ds) => ds.id === datasetId);
    if (!hasDataset) return [];
    return key.datasets.filter((ds) => ds.id !== datasetId);
  }

  getDomains(): Record<string, DomainEntry> {
    return this.seed.domains;
  }
}
