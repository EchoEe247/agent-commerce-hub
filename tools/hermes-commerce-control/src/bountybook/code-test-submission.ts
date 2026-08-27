export interface BountyBookCodeTestContract {
  readonly type: "code_test";
  readonly requiredFiles: readonly string[];
  readonly language: string | null;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonObject;
}

function parseSpec(value: unknown): JsonObject {
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("job spec is not valid JSON");
    }
    return asObject(parsed, "job spec");
  }
  return asObject(value, "job spec");
}

export function readCodeTestContract(
  job: JsonObject,
  expectedFilename: string,
): BountyBookCodeTestContract {
  const spec = parseSpec(job.spec);
  const success = asObject(spec.success_condition ?? spec.successCondition, "success condition");
  const type = success.type;
  if (type !== "code_test") {
    throw new Error(`expected code_test success condition, got ${String(type)}`);
  }

  const rawRequired = success.required_files ?? success.requiredFiles;
  if (!Array.isArray(rawRequired) || rawRequired.some((entry) => typeof entry !== "string")) {
    throw new Error("code_test required_files is missing or invalid");
  }
  const requiredFiles = rawRequired as string[];
  if (requiredFiles.length !== 1 || requiredFiles[0] !== expectedFilename) {
    throw new Error(
      `code_test required_files changed; expected only ${expectedFilename}, got ${requiredFiles.join(",") || "none"}`,
    );
  }

  const language = typeof success.language === "string" ? success.language : null;
  return Object.freeze({
    type: "code_test",
    requiredFiles: Object.freeze([...requiredFiles]),
    language,
  });
}

/**
 * BountyBook code_test verification materializes files from outputData.files.
 * Keep the payload minimal so the structural verifier sees the exact required
 * filesystem layout instead of treating metadata as the deliverable.
 */
export function buildCodeTestOutputData(
  filename: string,
  contents: string,
): Readonly<{ files: Readonly<Record<string, string>> }> {
  if (!filename.trim()) throw new Error("submission filename is required");
  if (!contents.trim()) throw new Error("submission file contents are empty");
  return Object.freeze({
    files: Object.freeze({ [filename]: contents }),
  });
}
