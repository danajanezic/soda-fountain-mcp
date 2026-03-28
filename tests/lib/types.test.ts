import { describe, it, expect } from "vitest";
import { DatasetIdSchema } from "../../src/lib/types.js";

describe("Zod schemas", () => {
  describe("DatasetIdSchema", () => {
    it("accepts valid 4x4 lowercase IDs", () => {
      expect(DatasetIdSchema.parse("tckn-sxa6")).toBe("tckn-sxa6");
      expect(DatasetIdSchema.parse("fbwv-q84y")).toBe("fbwv-q84y");
    });

    it("rejects uppercase characters", () => {
      expect(() => DatasetIdSchema.parse("ABCD-1234")).toThrow();
    });

    it("rejects missing dash", () => {
      expect(() => DatasetIdSchema.parse("abcd1234")).toThrow();
    });

    it("rejects too short", () => {
      expect(() => DatasetIdSchema.parse("abc-1234")).toThrow();
    });

    it("rejects too long", () => {
      expect(() => DatasetIdSchema.parse("abcde-12345")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => DatasetIdSchema.parse("")).toThrow();
    });
  });
});
