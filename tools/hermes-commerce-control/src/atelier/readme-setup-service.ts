export const ATELIER_README_SETUP_SERVICE = Object.freeze({
  title: "GitHub README Setup Fix 5 USD",
  category: "coding",
  description:
    "Send a public GitHub repository. I check the README setup instructions against repository manifests and return a corrected setup section plus a concise issue report. No credentials, deployments, or repository write access required.",
  priceType: "fixed",
  priceUsd: 5,
  platformFeeRate: 0.1,
  expectedNetUsd: 4.5,
  turnaroundHours: 4,
  maxRevisions: 1,
  deliverableType: "document",
  requirements: Object.freeze([
    Object.freeze({
      key: "repo_url",
      label: "Public GitHub repository URL",
      required: true,
      description: "Repository root URL, for example https://github.com/owner/repo",
    }),
    Object.freeze({
      key: "problem_or_goal",
      label: "Setup problem or goal",
      required: false,
      description: "Optional context about what is confusing or failing in the current setup instructions.",
    }),
  ]),
  scope: Object.freeze({
    publicRepositoriesOnly: true,
    customerCredentialsRequired: false,
    executesRepositoryCode: false,
    modifiesCustomerRepository: false,
    paidApiRequired: false,
    supportedStacks: Object.freeze(["node", "python", "go", "rust"]),
  }),
});

export interface ReadmeSetupOrderInput {
  readonly repoUrl: string;
  readonly problemOrGoal: string | null;
}

type JsonObject = Record<string, unknown>;

export function parseReadmeSetupOrderInput(value: unknown): ReadmeSetupOrderInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("order requirements must be an object");
  }
  const body = value as JsonObject;
  const repoUrl = body.repo_url;
  const problemOrGoal = body.problem_or_goal;
  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    throw new Error("repo_url is required");
  }
  if (problemOrGoal !== undefined && problemOrGoal !== null && typeof problemOrGoal !== "string") {
    throw new Error("problem_or_goal must be text when provided");
  }
  const goal = typeof problemOrGoal === "string" ? problemOrGoal.trim().slice(0, 2000) : "";
  return Object.freeze({ repoUrl: repoUrl.trim(), problemOrGoal: goal || null });
}
