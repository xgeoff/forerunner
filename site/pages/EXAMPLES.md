# Workflow Examples

> Example workflows are reference material for schema design, editor behavior,
> and future validation and CLI workflows.

## Purpose

The examples directory exists to provide concrete workflow definitions that can be:

- opened in the editor
- used as schema references
- used as test fixtures later
- shared as starting points for real workflow design

## Canonical Example Source

Starter example:

- `examples/workflows/canonical-workflow.toml`

Schema reference:

- [Schema](SCHEMA.html)

## What Makes a Good Example

A useful example workflow should demonstrate at least one of the following:

- linear `continue` routing
- explicit named routes under `routing`
- start-node declaration
- end-node usage
- readable labels and handler names

## Example Shape

```toml
workflow = "underwriting"
startNode = "underwrite"

[nodes.underwrite]
label = "Underwrite"
handler = "tenant.underwriting.evaluate"

[nodes.issue]
type = "end"
label = "Issue"

[continue]
underwrite = "issue"
```

## Intended Evolution

As the Forerunner ecosystem grows, the examples set should become more varied.

Likely future categories include:

- simple linear workflows
- branching validation workflows
- pricing or underwriting flows
- validator-focused invalid examples
- editor round-trip fixtures

## Recommendation

Treat example workflows as product assets, not throwaway samples.

They are the fastest way to communicate how the system is meant to be used.
