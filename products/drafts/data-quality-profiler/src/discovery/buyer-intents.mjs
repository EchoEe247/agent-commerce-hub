export const BUYER_INTENTS = Object.freeze([
  Object.freeze({
    id: "research_company",
    phrase: "research this company",
    terms: Object.freeze(["research", "company"]),
    expectedOperationId: "companyDomainIntelligence",
    expectedPreviewOperationId: "previewCompanyDomainIntelligence",
  }),
  Object.freeze({
    id: "enrich_domain",
    phrase: "enrich this domain",
    terms: Object.freeze(["enrich", "domain"]),
    expectedOperationId: "companyDomainIntelligence",
    expectedPreviewOperationId: "previewCompanyDomainIntelligence",
  }),
  Object.freeze({
    id: "investigate_business",
    phrase: "investigate this business",
    terms: Object.freeze(["investigate", "business"]),
    expectedOperationId: "companyDomainIntelligence",
    expectedPreviewOperationId: "previewCompanyDomainIntelligence",
  }),
  Object.freeze({
    id: "qualify_lead",
    phrase: "qualify this lead",
    terms: Object.freeze(["qualify", "lead"]),
    expectedOperationId: "companyDomainIntelligence",
    expectedPreviewOperationId: "previewCompanyDomainIntelligence",
  }),
  Object.freeze({
    id: "inspect_company_website",
    phrase: "inspect this company website",
    terms: Object.freeze(["inspect", "company", "website"]),
    expectedOperationId: "companyDomainIntelligence",
    expectedPreviewOperationId: "previewCompanyDomainIntelligence",
  }),
]);
