# EventPulse --- Walkthrough Document (Section 6.3)

This document explains the engineering reasoning, development process,
decision making, and challenges encountered while building EventPulse as
part of the Senior Backend Engineering Case Study.

------------------------------------------------------------------------

## 1. How the Problem Was Broken Down

The case study requirements were decomposed into functional and
operational responsibilities rather than feature-first implementation.

The system was divided into the following major domains:

1.  Event ingestion reliability.
2.  Durable persistence guarantees.
3.  Rule evaluation and anomaly detection.
4.  Notification delivery.
5.  Observability and testing.

The initial focus prioritized durability and deterministic recovery
rather than UI or analytics features.

Implementation sessions were organized around Functional Requirements
(FRs):

-   FR-01 → Event ingestion API.
-   FR-02 → Persistence layer.
-   FR-03 → Invalid payload handling.
-   FR-04 → ACK reliability strategy.
-   FR-05 → Pending message recovery.
-   FR-06 → Metrics and observability.
-   FR-07 → Rule engine abstraction.
-   FR-08 → Notification delivery.
-   FR-09 → Rule operation replacement.

This breakdown allowed isolated iteration without destabilizing
previously validated system behavior.

------------------------------------------------------------------------

## 2. Key Decision Points and Alternatives Considered

### Redis Streams vs Direct Database Writes

Alternative considered:

-   Direct API → PostgreSQL writes.

Rejected because:

-   API latency would depend on database performance.
-   Crash recovery would be harder to guarantee.

Chosen:

Redis Streams with consumer groups.

Benefits:

-   Replayable queue.
-   Pending entry recovery.
-   Backpressure handling.

------------------------------------------------------------------------

### Separate Worker Service

Alternative:

Single service handling ingestion and rule evaluation.

Rejected because:

-   Slow rule evaluation could block ingestion.

Chosen:

Dedicated worker process.

Outcome:

-   API latency remained predictable.
-   Failures isolated from ingestion path.

------------------------------------------------------------------------

### ACK Timing Strategy

Alternative:

ACK after rule evaluation.

Rejected because:

-   Rule failures could block durability.

Chosen:

Insert → ACK → Evaluate Rules.

Persistence became the system source of truth.

------------------------------------------------------------------------

### Rule Storage Strategy

Alternative:

In-memory rule storage.

Problem:

-   State loss during restart.
-   Difficult horizontal scaling.

Chosen:

Database-backed rule repository with hot reload via Redis Pub/Sub.

------------------------------------------------------------------------

## 3. Where AI Was Most Helpful

AI tools were most helpful during:

-   Architecture brainstorming and tradeoff discussions.
-   Generating scaffolding structures.
-   Debugging container configuration issues.
-   Documentation refinement.

AI accelerated exploration of alternative approaches and reduced
iteration time during debugging scenarios such as Docker networking and
WebSocket stability issues.

------------------------------------------------------------------------

## 4. Where AI Was Least Helpful

AI assistance was limited when:

-   Diagnosing concurrency edge cases.
-   Redis consumer group recovery behavior.
-   Lifecycle ordering bugs between ACK logic and rule evaluation.

These problems required manual experimentation, log inspection, and
repeated restart testing.

Human validation and reasoning were required to finalize solutions.

------------------------------------------------------------------------

## 5. Challenges Encountered and Resolutions

### ACK Ordering Confusion

Challenge:

Documentation initially mismatched implementation order.

Resolution:

Clarified design intent and updated comments to reflect:

Insert → ACK → Evaluate Rules.

------------------------------------------------------------------------

### Pending Entry Recovery

Challenge:

Understanding Redis consumer group cursor behavior during first startup.

Resolution:

Manual testing with worker restarts and PEL replay verification.

------------------------------------------------------------------------

### Docker Development Environment

Challenge:

Volume mounts and dependency persistence created inconsistent container
states.

Resolution:

Standardized rebuild procedures and documented recovery steps.

------------------------------------------------------------------------

### Rule Operation Replacement (FR‑09)

Challenge:

Replacing in‑memory rule logic without altering persistence guarantees.

Resolution:

Introduced repository abstraction ensuring behavioral parity while
maintaining existing ACK semantics.

------------------------------------------------------------------------

## 6. What I Would Change If Starting Over

If restarting the project:

-   Introduce database migrations from the beginning instead of
    automatic table creation for development.
-   Move notification configuration directly into database storage.
-   Add authentication boundaries earlier to avoid later refactoring.
-   Add structured tracing earlier for faster debugging.

Despite these improvements, prioritizing durability-first ingestion
proved to be the correct early decision.

------------------------------------------------------------------------

## Conclusion

EventPulse development emphasized reliability, observability, and
transparent engineering reasoning.

The iterative FR-based workflow allowed progressive delivery while
maintaining system stability and auditability throughout development.
