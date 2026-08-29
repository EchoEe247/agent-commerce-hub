/**
 * Stable recursive canonicalization of JSON-compatible values.
 * Objects: keys sorted recursively, then serialized.
 * Arrays: elements canonicalized in order.
 * Primitives: JSON.stringify.
 * null/undefined: "null".
 */
export function canonicalize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${pairs.join(",")}}`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalize(v));
    return `[${items.join(",")}]`;
  }
  return JSON.stringify(value);
}
