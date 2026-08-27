import { fetchPublicRepoSnapshot } from "./public-github-snapshot.js";
import { analyzeReadmeSetup, type SetupFixResult } from "./readme-setup-fix.js";
import { parseReadmeSetupOrderInput, type ReadmeSetupOrderInput } from "./readme-setup-service.js";
import { parseAtelierOrder, type AtelierOrderEnvelope } from "./marketplace-contract.js";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function inputFromPlainText(value: string): ReadmeSetupOrderInput {
  const githubMatch = value.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\b/i);
  if (!githubMatch?.[0]) {
    throw new Error("Atelier order brief does not contain a public GitHub repository URL");
  }
  const repoUrl = githubMatch[0];
  const problemOrGoal = value.replace(repoUrl, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
  return Object.freeze({ repoUrl, problemOrGoal: problemOrGoal || null });
}

export function parseReadmeSetupInputFromBrief(brief: unknown): ReadmeSetupOrderInput {
  if (typeof brief === "string") {
    const trimmed = brief.trim();
    if (!trimmed) throw new Error("Atelier order brief is empty");
    const parsed = parseJsonString(trimmed);
    if (parsed !== null) return parseReadmeSetupInputFromBrief(parsed);
    return inputFromPlainText(trimmed);
  }

  const object = asObject(brief);
  const nested = object.requirements ?? object.requirement_values ?? object.fields ?? object.input;
  if (nested !== undefined && nested !== brief) {
    try {
      return parseReadmeSetupInputFromBrief(nested);
    } catch {
      // Fall through to direct-field parsing below.
    }
  }

  const direct = {
    repo_url: object.repo_url ?? object.repoUrl ?? object.repository_url ?? object.repositoryUrl,
    problem_or_goal:
      object.problem_or_goal ?? object.problemOrGoal ?? object.goal ?? object.problem ?? object.context,
  };
  return parseReadmeSetupOrderInput(direct);
}

export interface PreparedAtelierReadmeOrder {
  readonly order: AtelierOrderEnvelope;
  readonly input: ReadmeSetupOrderInput;
  readonly result: SetupFixResult;
  readonly reportMarkdown: string;
}

export async function prepareAtelierReadmeOrder(
  rawOrder: unknown,
  options: { readonly expectedServiceId?: string } = {},
): Promise<PreparedAtelierReadmeOrder> {
  const order = parseAtelierOrder(rawOrder);
  const expectedServiceId = options.expectedServiceId?.trim();
  if (expectedServiceId && order.serviceId && order.serviceId !== expectedServiceId) {
    throw new Error(`order ${order.id} belongs to unexpected service ${order.serviceId}`);
  }
  if (!["paid", "in_progress", "revision_requested"].includes(order.status)) {
    throw new Error(`order ${order.id} is not actionable (status=${order.status})`);
  }

  const input = parseReadmeSetupInputFromBrief(order.brief);
  const snapshot = await fetchPublicRepoSnapshot(input.repoUrl);
  const result = analyzeReadmeSetup(snapshot);

  const context = [
    input.problemOrGoal ? `Buyer context: ${input.problemOrGoal}` : null,
    order.status === "revision_requested" && order.revisionFeedback
      ? `Revision feedback: ${order.revisionFeedback}`
      : null,
  ].filter((value): value is string => value !== null);

  const reportMarkdown = context.length
    ? `${result.reportMarkdown}\n\n## Buyer context\n${context.map((line) => `- ${line}`).join("\n")}`
    : result.reportMarkdown;

  return Object.freeze({ order, input, result, reportMarkdown });
}
