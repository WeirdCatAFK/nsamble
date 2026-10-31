# Eval cases

This folder holds regression cases from the supervised demo sessions. Each case names a prompt and the findings a correct run must produce.

## How to run a case

1. Start the full stack with Docker Compose.
2. Send the case prompt through a project conversation.
3. Record the questions, the spec, each part file, each review verdict, and the manifest.
4. Compare the record against the must-catch list. The run passes when it catches every item.

## Tiers

- Tier 1 checks single parts and fast rounds.
- Tier 2 checks complex parts with stacked features.
- Tier 3 checks full assemblies and install order.

See `cases.json` for the case list.
