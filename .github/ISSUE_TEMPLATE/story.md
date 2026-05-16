---
name: Story
about: Single deliverable change linked to an epic
title: "STORY-XXX: "
labels: "type: story"
---

## Epic
<!-- Link to parent epic: #N -->

## Problem
<!-- One paragraph. What is broken or missing? -->

## Current Evidence
<!-- file:line references, test names, observed behavior. No guessing. -->

## Desired Behavior
<!-- Exactly what changes. Be specific enough to write a test. -->

## Files Likely Touched
<!--
List by name. Example:
- src/core/projector.ts
- tests/unit/core/projector.test.ts
-->

## Files Forbidden To Touch
<!--
List any files that must not change in this story.
Example: src/ccp/task-state-machine.ts (add characterization test first)
-->

## Risk
<!-- P0 / P1 / P2 / P3 -->

## Environment
<!-- Dev / Prod / Both -->

## Verification Required
<!-- Check all that apply -->
- [ ] Unit test
- [ ] Integration test
- [ ] Characterization test (required before touching god nodes)
- [ ] Dev Pi smoke
- [ ] Prod clean install smoke
- [ ] Manual

## Tests Required
<!-- Which test files? What must they assert? -->

## Dev Verification Steps
<!-- Step-by-step. Must be runnable by any contributor. -->
1.

## Prod Verification Steps
<!-- Leave blank if Environment = Dev only -->
1.

## Acceptance Criteria
- [ ]

## Rollback Plan
<!-- What to revert. How to detect breakage. -->

## Visible Behavior Changed
<!-- yes / no. If yes, describe what changes. -->

## Install Impact
<!-- none / install / update / uninstall / packaging / docs-only -->

## Release Target
<!-- dev / beta / stable -->

## Notes
