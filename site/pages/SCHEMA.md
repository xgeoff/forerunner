# Canonical TOML Schema

> The TOML schema is the canonical text representation for Forerunner workflows.
> It is intended for source-controlled workflow definitions, editor round-tripping,
> and future CLI/validator tooling.

## Purpose

The schema defines how a workflow is represented outside the runtime engine.

It focuses on:

- a stable workflow identifier
- a required starting node
- node definitions keyed by id
- fallback routing through `continue`
- named routing through `routing`

The schema intentionally uses `continue` in the text form even though the runtime
model uses `continueTo` internally.

## Minimal Shape

```toml
workflow = "policy-underwriting"
startNode = "validate"

[nodes.validate]
label = "Validate Policy"
handler = "tenant.policy.validate"

[nodes.finalize]
type = "end"
label = "Finalize"

[continue]
validate = "finalize"

[routing.validate.highRisk]
to = "manualReview"
```

## Root Fields

### `workflow`

```toml
workflow = "policy-underwriting"
```

- Type: `string`
- Required: no
- Default: `"unnamed"`

This is the human-readable workflow name used by tooling such as the editor.

### `startNode`

```toml
startNode = "validate"
```

- Type: `string`
- Required: yes

This must match one of the node identifiers defined under `[nodes]`.

## Node Definitions

Nodes live under the root `[nodes]` table.

Each key under `[nodes]` becomes the node id.

```toml
[nodes.review]
label = "Manual Review"
handler = "tenant.review.manual"
```

### Supported Node Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | string | no | Defaults to `task`; currently `end` is the meaningful non-default type in the editor |
| `label` | string | no | Display label used by tooling |
| `handler` | string | no | Implementation-oriented handler name |
| `description` | string | no | Human-facing descriptive text |
| `metadata` | table | no | Free-form tool metadata |

### `type`

If omitted, the node should be treated as a normal `task` node.

```toml
[nodes.issue]
type = "end"
```

### `label`

`label` is the preferred display name for tooling.

```toml
[nodes.creditCheck]
label = "Credit Check"
```

If `label` is omitted, tooling may fall back to the node id.

## Continue Routing

Fallback routing is defined under `[continue]`.

```toml
[continue]
validate = "finalize"
```

This maps:

- `fromNodeId -> toNodeId`

It is used when a node returns a `Continue` outcome in the runtime model.

## Named Routing

Named routing is defined under nested `routing` tables.

```toml
[routing.validate.highRisk]
to = "manualReview"
```

This represents a named branch:

- from node: `validate`
- route name: `highRisk`
- target: `manualReview`

### Shape

```toml
[routing.<fromNodeId>.<routeName>]
to = "<targetNodeId>"
```

This is the text-based equivalent of an explicit `Next`-style branch.

## Validation Rules

The current canonical validation rules are:

- `startNode` must exist in `nodes`
- every `continue` target must exist in `nodes`
- every `routing.*.*.to` target must exist in `nodes`
- node ids are case-sensitive
- duplicate node ids are invalid

## Tooling Expectations

Current tooling uses the following fallback behavior:

- If `workflow` is omitted, the workflow name is treated as `unnamed`.
- If node `type` is omitted, the node is treated as a `task`.
- If `label` is omitted, tooling may use the node id for display.

## Mapping to Runtime

The TOML schema is not the runtime type model itself.

Instead:

- `dsl-toml` parses the text definition
- runtime graph structures are built from that parsed document
- the editor uses this schema as its editable text representation
