# W6 — World Aggregate & Application Boundary

Status: implementation foundation, additive to the W5 runtime baseline.

## 1. Purpose

W1–W2 define the person, identity, relation, cognition, planning, economy and life domains. W3–W4 define the append-only event source, schema registry, replay, snapshots and save packages. W5 connects those mechanisms to the playable preview runtime and local persistence.

The missing production boundary is the composition of those domain records into one world-scoped, queryable projection, plus application ports that keep UI, storage, simulation and AI providers replaceable.

W6 adds that boundary without changing W3/W4/W5 event, replay, snapshot, save or runtime-orchestrator semantics.

## 2. Authority and data flow

    UI / Player Input
           |
           v
    WorldCommandPort
           |
           v
    Application Command Handler
           |
           v
    Existing W5 Runtime Boundary
           |
           v
    W3 Event Ledger (append-only source of facts)
           |
           v
    W3 Replay / Projector
           |
           v
    WorldAggregate (read-only materialized projection)
           |
           +------> WorldQueryPort ------> UI View Models
           |
           +------> WorldSnapshotPort ---> Existing W4/W5 save adapters

The aggregate is derived state. It is never an alternative fact store and must never be written directly by UI, AI or narrative code.

## 3. Aggregate composition

The aggregate is scoped by WorldId, positioned by WorldTime, and anchored by a StreamCursor. It composes:

- Person lifecycle and state-domain references.
- Identity assignments, offices, appointments and authorizations.
- Relations, claims, evidence, organizations and memberships.
- Holder-scoped knowledge, messages and propagation.
- NPC goals, player aspiration, schedules and goal history.
- Assets, debts, rights revocations and succession.
- Life histories, body/mind hooks, life-state facts and life-stage facts.

Each domain retains its own model and validator. The aggregate validator composes those validators and adds cross-domain reference checks; it does not duplicate their business rules.

An empty aggregate is valid. A new world may exist before its first character, relation, office or goal is generated.

## 4. Application ports

app/src/application/world/ports.ts defines replaceable boundaries:

- WorldCommandPort: the only application-facing write port; requests carry a stable request ID and expected stream head.
- WorldQueryPort: read-only aggregate access and subscription.
- WorldSnapshotPort: adapter seam to existing snapshot/save-package infrastructure; it does not define a new save format.
- WorldSimulationPort: deterministic advancement over an explicit time interval and LOD.
- WorldCandidateProviderPort: AI/template candidate proposals with explicit exposed-ID allow-lists; proposals are untrusted and cannot commit facts.

The application layer depends on interfaces, not React, IndexedDB, Tauri, a model vendor or a network client.

## 5. Non-negotiable invariants

1. The event ledger is the only objective fact source.
2. Aggregate state must be rebuildable from the event stream and its registered reducers.
3. Every aggregate has one WorldId, one WorldTime and one stream cursor.
4. A cursor must anchor to the exact ledger head; a world clock cannot precede its latest committed event.
5. Cross-domain references must resolve inside the same world projection.
6. Player/NPC knowledge remains holder-scoped; no query may expose the full objective graph by default.
7. AI and templates return proposals only. Rule validation and ledger append remain deterministic.
8. LOD changes simulation detail and scheduling budget, never the meaning of already committed facts.
9. UI consumes query projections and submits commands; it does not evaluate authority, costs, time or event ordering.
10. W5 event ledger, Registry, Replay, Save/Restore and Runtime Orchestrator are protected dependencies. W6 adapts to them; it does not rewrite them.

## 6. Integration sequence

1. W6-A: canonical aggregate envelope, cross-domain validator and application ports. (This change.)
2. W6-B: typed world bootstrap and deterministic seed/fixture boundary; separate historical named-person allow-list from generated population.
3. W6-C: event-to-domain projection registry and aggregate rebuild contract, using existing replay without changing its protocol.
4. W6-D: command application handlers for person, identity, relation, cognition, planning and economy actions.
5. W6-E: L0–L3 simulation scheduler and candidate-provider adapter; deterministic fallback when AI is absent.
6. W6-F: UI query adapters and migration from preview-only selectors, without making the current preview's hard-coded seven-person fixture authoritative.
7. W6-G: persistence integration and full-world acceptance, reusing existing save-package and restore machinery.

Each step is separately testable. No UI migration or broad data rewrite is bundled into W6-A.

## 7. Explicitly out of scope

- Rewriting W5 runtime or save/restore internals.
- Replacing the current playable preview before the new application boundary is validated.
- Historical research, geography, river events or new art assets.
- Treating the current seven-person fixture, demo events or static scoring as the production world.
- Introducing a model provider, database vendor or desktop framework dependency.
