# TOML Workflow Schema (Canonical)

This is the canonical text schema for Forerunner workflow definitions.

## Document Shape

```toml
startNode = "validate"

[nodes]
[nodes.validate]
type = "task"

[nodes.finalize]
type = "task"

[continue]
validate = "finalize"

[routing.validate.highRisk]
to = "manualReview"
```

## Fields

- `startNode` (string, required)
  - Identifier of the first node to execute.

- `nodes` (table, required)
  - Keys are node ids.
  - Values are node definition tables.

- `continue` (table, optional)
  - Mapping of `fromNodeId -> toNodeId` used for fallback routing when a node returns `Continue`.

- `routing` (table, optional)
  - Nested mapping for named conditional routes.
  - Shape: `routing.<fromNodeId>.<routeName>.to = "<targetNodeId>"`.

## Node Definition

Current canonical node table fields:

- `type` (string, optional, default `"task"`)
- `description` (string, optional)
- `metadata` (table, optional, free-form)

## Validation Rules

- `startNode` must exist in `nodes`.
- Every `continue` target must exist in `nodes`.
- Every `routing.*.*.to` target must exist in `nodes`.
- Node ids are case-sensitive.
- Duplicate node ids are invalid.

## Notes

- The TOML schema intentionally uses `continue` (not `continueTo`).
- Runtime model mapping from TOML to engine graph is handled by `dsl-toml` and downstream validator/CLI layers.
