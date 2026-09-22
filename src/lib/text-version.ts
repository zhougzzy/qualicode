/**
 * This is an identity hash, not a security hash. It gives both browser and
 * server code a dependency-free way to detect text mismatches.
 */
export function createTextVersion(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
