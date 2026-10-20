/** A file's bytes as standard base64, as the import's action and API take a workbook (spec Q13). */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // In slices: spreading half a megabyte into one call would overflow the argument stack.
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}
