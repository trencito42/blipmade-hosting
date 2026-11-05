# AGENTS.md

Instructions for any AI agent working in this repository (Blipmade Hosting). Keep this file short; the details are in the documents below.

## Read first, in this order
1. `docs/AI-HANDOFF.md`: what exists, what is verified, what runs in production.
2. `docs/AI-OPERATING-RULES.md`: safety rules, boundaries, verification standards, workflow.
3. `docs/KNOWN-ISSUES.md`: failing tests, blockers, unverified assumptions.
4. `docs/IMPLEMENTATION-ROADMAP.md`: what to do next, by priority, with acceptance tests.

## Non-negotiable
- No production deploy, `.env` change, live DNS/price/subscription change or feature flag change without the owner's explicit approval in chat. Publish and deploy are separate commands.
- Stripe: test mode only, isolated. #21 is not to be activated.
- Never print, store or commit secrets. Do not search for credentials; ask.
- Do not close issues unless told. Reuse the existing catalogue (#20), DNS engine (#23) and resize pipeline (#21); do not build parallel registries.
- Claim only what a test or run you saw pass proves; label the rest UNVERIFIED.

`docs/WORKFLOW.md` and `scripts/README.md` describe the publish/deploy scripts. Older notes in `docs/ai/` are history.
