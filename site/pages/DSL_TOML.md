# TOML DSL

> The TOML DSL is the text-based authoring surface for Forerunner workflows.
> It complements the runtime API and the visual editor rather than replacing them.

## Why It Exists

Forerunner workflows can be defined in code, but there are cases where a text
format is more practical:

- storing workflows in source control
- reviewing workflow changes in pull requests
- sharing workflow definitions across tools
- loading workflows in the editor
- future CLI-based validation and inspection

The TOML DSL is intended to be the canonical text format for those workflows.

## Relationship to the Runtime

The TOML DSL is not a separate execution model.

It maps into the same conceptual workflow structure used by the engine:

- a workflow name
- a start node
- a node map
- fallback routing
- named routing

That means the TOML form is a serialization and authoring layer, not a second runtime.

## Canonical Routing Terms

The current canonical routing keys are:

- `continue` for fallback routing entries
- `routing` for named branch routing entries

This naming is intentional.

- `continue` is the textual DSL representation
- `continueTo` is the runtime-side graph representation inside the engine model

## Example

```toml
workflow = "underwriting"
startNode = "underwrite"

[nodes.underwrite]
label = "Underwrite"
handler = "tenant.underwriting.evaluate"

[nodes.issue]
type = "end"
label = "Issue Policy"

[continue]
underwrite = "issue"
```

## What Lives Here

The TOML DSL layer is responsible for:

- canonical workflow text structure
- parsing and mapping support
- schema alignment with the editor
- future compatibility with validator and CLI tooling

## Current Scope

At the moment, the TOML DSL work is centered around:

- the canonical schema
- workflow import/export alignment with the editor
- stable routing terminology

The schema reference lives here:

- [Schema](SCHEMA.html)

## Intended Ecosystem Role

The TOML DSL is meant to be the common interchange format between:

- source-controlled workflow definitions
- the visual editor
- future validator tooling
- future CLI workflows

That makes it the natural textual contract for the broader Forerunner toolchain.
