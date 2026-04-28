# Agentic OS Runtime Design

Date: 2026-04-27
Status: Proposed
Scope: Core substrate only

## 1. Purpose

Define the minimum architecture for an Agentic Operating Layer that is:

- modular
- domain-agnostic
- deterministic at the shell boundary
- consumable by thin domain repositories without cloning framework code

This document covers the core operating model only. It does not attempt to solve every downstream concern. The immediate goal is to establish the substrate that later plans can implement in small, inspectable steps.

## 2. Problem Statement

The current structure mixes framework concerns with project concerns. Repositories such as `brain_playground` carry too much copied runtime material, which creates these problems:

- framework drift across repos
- high bootstrap friction for new domains
- unclear separation between governance logic and application logic
- poor scalability across unrelated domains such as trading, research, and web development

The desired architecture is one where:

- `context_os` is installed centrally on the developer machine as a runtime
- `knowledge-brain` provides persistent memory as a separate local service/component
- each domain repository is a thin consumer that declares identity, constraints, and defaults

## 3. Goals

- eliminate framework cloning in domain repositories
- make a new repo Agent-Ready through configuration, not copied code
- keep the deterministic shell outside the model
- ensure memory isolation across projects
- support multiple domains through the same runtime
- enable versioned runtime compatibility across different repositories

## 4. Non-Goals

- no remote control plane
- no mandatory network dependency
- no multi-user distributed memory service
- no attempt to solve every domain workflow in the first milestone
- no implementation detail for package format, CLI syntax, or internal code structure

## 5. Architectural Position

The system is split into three layers:

### 5.1 `context_os`: Governance Runtime

Machine-local, versioned control plane responsible for:

- constitution loading
- policy enforcement
- skill and protocol hydration
- permission checks
- verification gates
- event logging
- memory routing

### 5.2 `knowledge-brain`: Memory Plane

Machine-local, deterministic memory component responsible for:

- persistent storage
- query/write/export/import primitives
- tenant-aware namespace routing as instructed by `context_os`

### 5.3 `domain_repo`: Thin Application Layer

Project-local consumer responsible for:

- domain code
- domain configuration
- project-specific constraints
- binding metadata
- optional project memory export snapshot

The domain repository must not own framework behavior.

## 6. Core Design Principle

The architecture shall be a deterministic shell around a probabilistic core.

The model may propose actions and synthesize content, but it is not the authority on:

- identity
- permissions
- session state
- verification success
- memory routing
- completion truth

Those concerns belong to the runtime.

## 7. Binding Contract

### 7.1 Purpose

The Binding Contract is the minimum interface between a blank repository and the centrally installed runtime. Its role is to let a repository declare what it is, which runtime it is compatible with, and which constraints must apply.

### 7.2 Required Binding Metadata

Each domain repository must provide a single manifest containing enough information to answer five questions:

1. Who is this project?
2. Which runtime version does it require?
3. Which local constraints narrow the central rules?
4. Which memory namespace should be mounted?
5. How should work be verified in this repository?

Minimum fields:

- project identity
- domain type
- runtime version or version range
- project constitution reference, if present
- verification profile or verification defaults
- memory namespace configuration
- capability restrictions or policy flags

### 7.3 Binding Sequence

When an agent starts in a directory, the runtime performs this sequence:

1. discover repository root
2. locate binding manifest
3. validate manifest schema
4. derive canonical project identity
5. resolve compatible `context_os` runtime version
6. load central constitution
7. load project constitution and project constraints
8. establish session binding record
9. mount memory namespaces
10. hydrate skills, protocols, and gates

### 7.4 Precedence Rules

Precedence must be strict:

1. central constitution
2. central runtime policies
3. project constitution
4. project manifest
5. task-specific instructions
6. model output

Lower layers may narrow higher layers but may never widen them.

## 8. Deterministic Shell

### 8.1 Control Loop

All meaningful side effects must pass through this loop:

1. Intent
2. Policy Check
3. Execution
4. Verification and Receipt

The model may generate intent. The runtime owns the other three stages.

### 8.2 Controlled Boundaries

The runtime must interpose on these boundaries:

- filesystem write
- command execution
- network access
- memory read/write
- state transition
- completion claim

This is the minimum necessary deterministic shell.

### 8.3 Verification Gates

The runtime should model work as an explicit state machine. Minimum conceptual states:

- `BOUND`
- `PLANNED`
- `EXECUTED`
- `VERIFIED`
- `REVIEWED`
- `COMPLETE`

Critical rule:

- `COMPLETE` is unreachable without passing verification requirements defined by the runtime and narrowed by the project

### 8.4 Append-Only Event Log

The runtime owns an append-only log of execution facts.

Required event classes:

- binding
- policy load
- capability decision
- action request
- action execution
- memory access
- verification start/end
- state transition
- completion gate pass/fail

This log is evidence. It is not editable by the model.

## 9. Constitution Layering

The central constitution defines universal invariants for all domains.

Examples:

- no memory write before successful binding
- no unverified completion
- no privileged action without declared permission path

Project constitutions define domain-specific narrowing.

Examples:

- trading projects may require simulation evidence before live execution paths
- web projects may require tests before deployment-affecting changes
- research projects may require source traceability before promoting claims to durable memory

Project constitutions cannot disable central rules.

## 10. Manifest-Driven Bootstrap

### 10.1 Decision

Repository bootstrap should be manifest-driven.

Machine installation may be script-driven, but repository binding must be configuration-driven.

### 10.2 Reasoning

Manifest-driven binding is preferred because it is:

- declarative
- reviewable
- versionable
- language-agnostic
- less drift-prone than copied scripts

Scripts remain appropriate only for:

- installing the central runtime
- registering MCP or local tool integrations
- setting machine-level environment variables

### 10.3 Version Resolution

Different repositories may require different runtime versions.

The local machine runtime manager must support:

- side-by-side installed runtime versions
- manifest-declared compatibility ranges
- deterministic version resolution during binding

Versioning must be solved by the central runtime manager, not by copying framework files into repositories.

## 11. Memory Tenancy And Isolation

### 11.1 Memory Classes

Memory is divided into:

- Global Wisdom
- Project Context

Global Wisdom contains reusable cross-project knowledge.
Project Context contains repo-scoped facts, decisions, and artifacts.

### 11.2 Default Read/Write Policy

Default read order:

1. project memory
2. global memory

Default write target:

- project memory

Writes to global memory require explicit promotion.

### 11.3 Promotion Rule

No project fact becomes global by default.

Promotion to global memory must be explicit and retain provenance back to the project source.

### 11.4 Isolation Rule

A session bound to one repository may:

- read/write its own project namespace
- read global namespace if enabled

It may not read another project's namespace unless explicitly granted.

### 11.5 Namespace Strategy

Project namespaces must derive from stable project identity rather than folder names alone.

The namespace should be based on a canonical project identifier plus stable repository identity inputs. The objective is deterministic routing even if local checkout paths change.

## 12. `brain_playground` Transition To Pure Consumer

### 12.1 Current Problem

`brain_playground` currently behaves too much like a mirrored framework repository. It contains generic runtime material that should be supplied by the central runtime.

### 12.2 Target State

`brain_playground` should become a thin consumer that retains only:

- domain code
- domain configuration
- domain documentation
- tests
- binding manifest
- optional project constitution
- optional project verification profile
- optional project memory export snapshot

### 12.3 What Must Move Out

The following classes of concern belong in `context_os`, not in the consumer repo:

- generic governance instructions
- generic bootstrap logic
- generic verification scripts
- generic protocol definitions
- generic skill registries

### 12.4 Developer Experience Impact

The developer should no longer see the framework source tree as part of each project.

The desired experience is:

1. create or clone a project
2. add a binding manifest and optional local constraints
3. open the directory
4. let the central runtime bind automatically

This reduces project noise and makes the framework feel like a toolchain rather than copied source.

## 13. First Increment Boundary

The first implementation phase should focus only on the core substrate:

- repo binding contract
- runtime version resolution
- deterministic shell state model
- append-only event log
- memory namespace routing
- `brain_playground` conversion into a thin consumer

Explicitly defer:

- advanced domain skill packs
- remote execution
- multi-user live memory infrastructure
- automated cross-project knowledge curation

## 14. Open Decisions For The Next Spec Or Plan

These decisions are deliberately left for the next document:

- exact manifest schema fields and validation rules
- exact session binding record format
- exact event log schema and retention model
- exact runtime version manager behavior
- exact promotion workflow for project-to-global memory
- exact folder shape for a pure consumer repo

## 15. Success Criteria

This design is successful if:

- a new repo becomes Agent-Ready through configuration only
- framework code no longer needs to be copied into domain repositories
- project constraints can narrow central rules without breaking invariants
- memory remains isolated by default across projects
- completion claims are gated by runtime-owned verification
- `brain_playground` can function as a true consumer rather than a framework mirror

