import { createHash } from "node:crypto";

export function fingerprintSchema(fieldProfiles) {
  const entries = Object.entries(fieldProfiles)
    .map(([name, profile]) => ({
      name,
      inferred_type: profile.inferred_type,
      nullable: profile.null_count > 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const digest = createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex");
  return `sha256:${digest}`;
}
