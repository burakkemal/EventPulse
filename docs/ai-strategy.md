# AI Strategy Narrative --- EventPulse Case Study

**Date:** 2026-02-20

## Overview

This document summarizes how AI tools were strategically used during the
EventPulse case study.\
The goal was not to replace engineering judgment, but to accelerate
iteration, validate ideas, and reduce boilerplate effort while
maintaining full ownership of architectural decisions.

------------------------------------------------------------------------

## AI Workflow Approach

AI tools were used selectively depending on task complexity:

-   Architecture and design brainstorming
-   Edge‑case analysis and validation
-   Boilerplate code acceleration
-   Documentation structuring

Core business logic decisions, persistence semantics, and async
processing flows were reviewed and finalized manually.

------------------------------------------------------------------------

## Tools Used

### ChatGPT

Used primarily for:

-   Idea exploration and architectural trade‑off discussions
-   Requirement interpretation against the case study specification
-   Prompt iteration for rule engine design and async processing
    validation

ChatGPT was also used as a **senior reviewer simulation** to identify
risks before submission.

------------------------------------------------------------------------

### Claude AI

Used for:

-   Deep reasoning reviews
-   Documentation clarity checks
-   Gap analysis against functional and non‑functional requirements

Claude was particularly helpful for long‑context analysis of
documentation and requirement alignment.

------------------------------------------------------------------------

### AI‑Assisted Code Generation

AI assistance was used for:

-   API boilerplate scaffolding
-   Validation schemas
-   Test structure suggestions
-   Docker configuration patterns

Generated outputs were never accepted blindly. Each suggestion was
manually validated through:

-   Local testing
-   Runtime verification
-   Architecture consistency checks

------------------------------------------------------------------------

## Prompt Engineering Techniques

The following strategies were applied:

-   Providing full project context before asking questions
-   Constraining AI output (e.g., "do not modify persistence semantics")
-   Iterative prompting instead of single large prompts
-   Requesting reviewer‑style audits instead of direct solutions

------------------------------------------------------------------------

## AI Limitations Encountered

Observed limitations included:

-   Incorrect async processing assumptions
-   Over‑engineering suggestions not aligned with PoC scope
-   Occasionally unsafe retry or queue handling recommendations

These were corrected through manual review and testing.

------------------------------------------------------------------------

## Trust Calibration

AI‑generated code received different levels of review depending on
impact:

-   High risk areas (queue processing, persistence, ACK logic) → full
    manual validation
-   Boilerplate → light review

Trust level increased only after repeated accurate outputs in similar
contexts.

------------------------------------------------------------------------

## Efficiency Impact

Estimated time saved:

-   Architecture exploration: \~2--3 hours
-   Documentation structuring: \~1--2 hours
-   Boilerplate coding: \~2 hours

Total estimated time saved: **\~5--7 hours**.

------------------------------------------------------------------------

## Summary

AI tools were treated as collaborative assistants rather than
authoritative sources. All final engineering decisions, trade‑offs, and
validations remained human‑driven.
