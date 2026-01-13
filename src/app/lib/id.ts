export function createId(prefix: string) {
  // Good enough for local IDs (not cryptographic).
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}



