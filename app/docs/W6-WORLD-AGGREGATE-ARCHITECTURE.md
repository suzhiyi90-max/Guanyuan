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
           +------> WorldQueryPort ------> Internal application orchestration
           |
           +------> WorldObserverQueryPort --> Observer-safe UI View Models
           |
           +------> WorldSnapshotPort ---> Existing W4/W5 save adapters

The aggregate is derived state. It is never an alternative fact store and must never be written directly by UI, AI or narrative code. Every person also has persisted creation provenance: seeded-random, verified famous-minister exception, or player-character. County and grassroots roles cannot use a fixed-name origin; generated origins must match the world's seed fingerprint.

## 3. Aggregate composition

The aggregate is scoped by WorldId, positioned by WorldTime, and anchored by a StreamCursor. It composes:

- Person lifecycle and state-domain references.
- Identity assignments, offices, appointments and authorizations.
- Observer-owned exposures (heard-of / seen / met / conversed / corresponded), relations, claims, evidence, organizations and memberships.
- Exposure is a contact/awareness record, not a relation: hearing of or meeting a person never automatically creates friendship, acquaintance, colleague status or any other social edge.
- Holder-scoped knowledge, messages and propagation.
- NPC goals, player aspiration, schedules and goal history. Schedule intent is distinct from execution: execution confirmation references an already-committed action result event; deviation is an independent event with a reason; one planned entry can be settled only once.
- Assets, debts, rights revocations and succession.
- Life histories, body/mind hooks, life-state facts and life-stage facts.

Each domain retains its own model and validator. The aggregate validator composes those validators and adds cross-domain reference checks; it does not duplicate their business rules. It also verifies schedule execution/deviation settlement provenance against the ledger, so a snapshot cannot claim a task was carried out merely by pointing at an arbitrary event.

An empty aggregate is valid. A new world may exist before its first character, relation, office or goal is generated.

## 4. Application ports

app/src/application/world/ports.ts defines replaceable boundaries:

- WorldCommandPort: the only application-facing write port; requests carry a stable request ID and expected stream head.
- WorldQueryPort: internal read-only aggregate access for bootstrap and application orchestration; not a direct player-screen data source.
- WorldObserverQueryPort: observer-scoped read models and subscriptions for presentation. It filters exposure, identity, relations, claims, evidence, memberships, knowledge, messages, goals and schedules by the viewing person. Known-person cards expose identity summaries only, not full hidden NPC lifecycle/state-domain records.
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
6. Player/NPC knowledge remains holder-scoped; no player-facing query may expose the full objective graph or unconnected world roster by default.
7. Exposure and Relation are separate. Exposure records who heard of, saw, met, conversed with, or corresponded with a person; relation edges require their own formation event and evidence. Exposure cannot be promoted into a relationship by UI or AI text.
8. AI and templates return proposals only. Rule validation and ledger append remain deterministic.
9. LOD changes simulation detail and scheduling budget, never the meaning of already committed facts.
10. UI consumes observer-scoped query projections and submits commands; it does not evaluate authority, costs, time or event ordering.
11. W5 event ledger, Registry, Replay, Save/Restore and Runtime Orchestrator are protected dependencies. W6 adapts to them; it does not rewrite them.
12. Frontend additions must follow the established paper-document visual system, component hierarchy, interaction semantics and motion discipline. Domain work must not invent parallel navigation, placeholder art, programmatic illustrations or one-off CSS visual substitutes. Official art assets remain an externally supplied input; no art asset is generated or replaced by this implementation.

## 6. Integration sequence

1. W6-A: canonical aggregate envelope, cross-domain validator and application ports. Implemented.
2. W6-B: typed world bootstrap, deterministic population generation and explicit person-origin policy. Implemented.
3. W6-C: versioned world-domain event registry, pure reducers and W3 replay-backed aggregate projector. The event slice now covers person, identity, organization, relation, exposure, cognition, communication, planning, economy and related lifecycle mutations.
4. W6-D: deterministic bootstrap and resumable application materialization of county/grassroots seeded-random people, with the verified-famous-minister allow-list exception. Implemented with command idempotency and expected-head checks.
5. W6-E: in-memory command/query adapter executing schema validation, canonical ledger append, replay and publish. Planning/economy command intents are wired through the same path.
6. W6-F: observer-scoped read model separating the internal aggregate from player/NPC views; includes contact/exposure without relationship inference and holder-scoped cognition/communications. This is the safe frontend integration boundary; no visual UI migration is included yet.
7. W6-G: deterministic L0–L3 simulation scheduler, schedule execution, decay/maintenance and candidate-provider adapter; deterministic fallback when AI is absent. **In progress:** the first scheduler slice now derives stable tasks from pending schedule entries, orders them by due time / priority / stable ID, applies an explicit event budget, commits only through WorldCommandPort, and records schedule settlement against the committed action event. Interrupted action/settlement pairs return pending task IDs and resume through stable idempotency keys. The LOD-specific action resolver is injected; AI candidate output is not a scheduler task source. Remaining W6-G work includes canonical clock-advance facts for empty intervals, deterministic body/mind and economy maintenance events, and the concrete L0–L3 policy/task resolvers.
8. W6-H: command handlers for scene interaction, office/governance actions, communication, goals and economy, including complete cost/time/permission resolution.
9. W6-I: frontend query-selector migration, preserving existing visual/interaction rules and keeping the current hard-coded fixture non-authoritative.
10. W6-J: persistence integration and full-world acceptance, reusing existing save-package and restore machinery.

Each step is separately testable. No UI migration or broad data rewrite is bundled into W6-A/B/C.

## 7. Explicitly out of scope

- Rewriting W5 runtime or save/restore internals.
- Replacing the current playable preview before the new application boundary is validated.
- Historical research, geography, river events or new art assets.
- Treating the current seven-person fixture, demo events or static scoring as the production world.
- Introducing a model provider, database vendor or desktop framework dependency.
