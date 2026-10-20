import { describe, expect, it } from "vitest";
import { fileToBase64 } from "./base64";

describe("fileToBase64", () => {
  it("encodes every byte, past the slice size too", async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const encoded = await fileToBase64(new Blob([bytes]));

    expect(Buffer.from(encoded, "base64").equals(Buffer.from(bytes))).toBe(true);
    expect(await fileToBase64(new Blob([]))).toBe("");
  });
});
