# Revenue Operating Principles

`agent-commerce-hub` exists to help agents make money with as little human babysitting as practical.

This is a standing repository mission, not a temporary project phase.

## Primary optimization target

Work in this repository should preferentially improve one or more parts of the revenue loop:

`opportunity discovery → qualification → pricing → execution → quality gate → delivery → payment → follow-up/repeat business → revenue measurement`

The default objective is to shorten and automate that loop while keeping the result reliable enough to protect revenue.

## Agent-autonomy rule

Prefer changes that let agents complete useful commercial work end to end without waiting for the operator for routine decisions.

Good changes tend to:

- find or surface credible paid opportunities;
- reject low-value or bad-fit opportunities cheaply;
- make pricing and scope decisions more consistent;
- reduce manual setup, repetitive prompts, and handoffs;
- let agents execute, validate, package, and deliver work predictably;
- make payment collection and commercial state easier to reason about;
- reduce repeated debugging or review of already-solved failure classes;
- make successful workflows reusable across future orders;
- improve time-to-revenue, conversion, margin, repeatability, or customer retention.

Human involvement should be reserved for decisions that genuinely require operator judgment, credentials/authorization, production-risk acceptance, financial approval, legal/compliance judgment, or subjective quality review that cannot be honestly automated.

## Revenue-first prioritization test

Before adding meaningful work, ask:

1. What revenue bottleneck does this remove or reduce?
2. Does it increase the probability, speed, value, or repeatability of getting paid?
3. Does it reduce operator babysitting or future agent effort?
4. Is the reliability work proportionate to the commercial downside it prevents?
5. Is this necessary infrastructure for revenue, or engineering for its own sake?

If a proposed change has no credible path to revenue, agent autonomy, commercial reliability, or reduced operating burden, it should normally be deprioritized.

## Avoid engineering drift

Do not optimize for architecture, abstraction, agent count, tooling volume, observability, or verification merely because they are technically interesting.

Avoid loops such as:

`more infrastructure → more internal tooling → more verification → no customer → no payment`

Infrastructure is justified when it materially reduces future work, prevents a demonstrated revenue-threatening failure, enables a blocked commercial workflow, or makes paid work more autonomous and repeatable.

A regression/proof gate that prevents repeated babysitting is useful. Repeatedly expanding that gate without a new demonstrated need is not.

## Safety and production override

Revenue-first does not mean bypassing production controls, financial authorization, security boundaries, or irreversible-risk checks.

When real customers, payments, persistent data, credentials, production deployment, wallets, signing authority, or material downside are involved, controlled change and explicit authorization take precedence over speed.

The desired result is not maximum automation at any cost. It is maximum practical agent autonomy inside the required safety and financial boundaries.

## Definition of useful completion

For commercial work, implementation is not complete merely because code exists.

Prefer completion states that leave the system closer to earning money with less operator work, for example:

- an opportunity can now be discovered and qualified automatically;
- a product can now be executed and delivered reliably;
- a known failure class is now permanently prevented;
- a buyer can understand, purchase, receive, or repeat an offering more easily;
- an agent can resume or complete the workflow without re-learning settled context;
- revenue performance can be measured and used to decide what to keep, improve, or retire.

When choosing between two otherwise-valid next steps, prefer the one with the clearer near-term effect on revenue or autonomous commercial execution.
