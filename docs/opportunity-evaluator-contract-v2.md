# Opportunity evaluator contract v2

The local/provider-neutral opportunity evaluator uses a strict schema. Evaluation policy version 2 tightens economics semantics after live Hy3 evaluation showed that explicit payout text could cause an otherwise useful model to invent unsupported objects such as `{ amount, currency, unit, note }`.

## Money fields

Each of `economics.payout`, `economics.executionCost`, and `economics.margin` is either `null` or exactly:

```json
{
  "minUsd": 150,
  "maxUsd": null,
  "basis": "observed"
}
```

No alternate keys are accepted or normalized.

`economics.payout` means the **total expected payout in USD for the opportunity**. A per-video, per-unit, hourly, commission, revenue-share, contingent, or non-USD amount does not become a total payout automatically. If the packet does not establish a faithful total USD amount/range, payout must be `null`; the evaluator must not perform an FX conversion.

This deliberately prefers unknown economics over misleading precision. Unit/rate information can remain in model reasoning/checks for operator review without contaminating the structured total-payout field.

## Policy-versioned request identity

Prepared evaluation request IDs now hash both the bounded evaluation packet and `OPPORTUNITY_EVALUATION_POLICY_VERSION`. A semantic contract change therefore rotates `evalreq_*` IDs, causing old persisted model results to become non-current instead of being silently reused under new prompt rules.

The parser remains strict. It does not repair or normalize invalid model economics output.