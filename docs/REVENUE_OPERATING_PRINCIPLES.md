# Revenue Operating Principles

`agent-commerce-hub` exists to help agents make money with as little routine human babysitting as practical.

This is a standing repository mission, not a temporary phase.

## Primary optimization target

The commercial loop is:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

Repository work should preferentially improve that loop.

The main question is not whether a change is technically interesting. It is whether the change makes paid work more likely, faster, more valuable, more repeatable, or less dependent on the operator for routine decisions.

## Agent-autonomy rule

Prefer changes that let agents complete useful commercial work end to end without pausing for the operator when no real authorization or judgment boundary exists.

Useful improvements can include:

- finding credible paid opportunities;
- rejecting low-value or bad-fit opportunities cheaply;
- making pricing and scope decisions more consistent;
- reducing repetitive setup, prompts, and handoffs;
- making execution, validation, packaging, and delivery more predictable;
- making payment/commercial state easier to reason about;
- preventing already-solved failure classes from repeatedly consuming attention;
- making successful workflows reusable across future orders;
- improving time-to-revenue, conversion, margin, repeatability, or customer retention.

Human involvement should be reserved for things that actually need it: credentials or authorization, production-risk acceptance, financial approval, legal/compliance judgment, operator-level strategy, or subjective quality review that cannot be honestly automated.

Do not stop useful commercial work merely because a human would traditionally be involved if the system already has enough authority and evidence to continue safely.

## Revenue-first prioritization test

Before adding meaningful work, ask:

1. What commercial bottleneck does this remove or reduce?
2. Does it increase the probability, speed, value, or repeatability of getting paid?
3. Does it reduce operator babysitting or future agent effort?
4. Is the reliability work proportionate to the commercial downside it prevents?
5. Is this necessary infrastructure for revenue, or engineering for its own sake?

If a proposed change has no credible connection to revenue, commercial autonomy, reliability of a real revenue path, or reduced operating burden, it should normally be deprioritized.

## Avoid engineering drift

Do not optimize for architecture, abstraction, agent count, tooling volume, observability, or verification merely because more of it is possible.

The failure pattern to avoid is:

`more infrastructure → more internal tooling → more verification → no customer → no payment`

Infrastructure is justified when it materially reduces future work, prevents a demonstrated revenue-threatening failure, enables a blocked commercial workflow, or makes paid work more autonomous and repeatable.

A regression/proof gate that permanently removes repeated babysitting is useful. Expanding that gate again and again without a new failure mode is not.

## Safety and production override

Revenue-first does not mean bypassing production controls, financial authorization, security boundaries, or irreversible-risk checks.

When real customers, payments, persistent data, credentials, production deployment, wallets, signing authority, or material downside are involved, the required control/authorization boundary takes precedence over speed.

The target is **maximum practical agent autonomy inside the real safety, financial, and production boundaries**, not maximum automation at any cost.

## Definition of useful completion

Commercial work is not complete merely because code exists.

A useful completion state should leave the system meaningfully closer to earning or retaining money with less operator work. Examples:

- an opportunity can now be discovered and qualified automatically;
- a product can now be executed and delivered reliably;
- a demonstrated failure class is now prevented;
- a buyer can understand, purchase, receive, or repeat an offering more easily;
- an agent can resume or finish the workflow without reconstructing settled context;
- revenue performance can be measured well enough to decide what should be kept, improved, or retired.

When two next steps are otherwise valid, prefer the one with the clearer near-term effect on revenue or autonomous commercial execution.