# Workflow Editor

The Forerunner editor is a web-based tool for building workflows visually while
keeping the canonical TOML definition in view. It is designed for graph editing,
route inspection, and TOML round-tripping rather than backend-connected runtime
operations.

## Current Scope

The editor is currently a local-first workflow design tool. It supports:

- visual graph editing
- TOML editing and apply-back-to-graph behavior
- node and route inspectors
- theme switching
- workflow import/export from the in-browser model
- automatic graph layout and viewport controls

It does **not** currently depend on backend services. File-oriented and settings
workflows are local UI features.

## Implementation Stack

The editor lives in the `editor/` directory and is built as a separate Node/Vite
project.

### UI and State

- **Atomica** is used for the UI/state layer.
- The editor keeps graph state in browser memory and re-renders from that state.

### Styling and Layout

- **Skeleton CSS** provides the basic CSS foundation.
- **Skeleton-plus** provides the higher-level visual shell and component styling.

### Workflow Representation

The editor works from the same conceptual pieces as the runtime:

- nodes
- routes
- start node
- TOML workflow metadata

Its internal graph state is then exported into the canonical TOML schema.

## Core Editing Model

### Nodes

Nodes are created as plain workflow nodes. By default, a new node is a `task`.

Current node configuration fields include:

- `id`
- `label`
- `handler`
- `type`

At the moment, the relevant node types in the editor are:

- `task`
- `end`

The workflow start node is tracked separately at the workflow level.

### Start Node

The first created node becomes the workflow start node automatically.

A different node may later be marked as the start node in the node inspector.
When that happens, the previously selected start node is demoted back to a
normal task-style node.

### Routes

Routes are created by dragging from a node handle.

The editor currently supports two route forms:

- `continue`
- named `route`

Behavior:

- if the route name is left blank, the connection becomes a `continue`
- if a route name is provided, the connection becomes a named route

The editor enforces the current graph rules during route creation and editing.
For example, a node may not have more than one `continue` route.

## Canvas Interaction

### Viewport Controls

The editor supports:

- zoom in
- zoom out
- center workflow
- auto-arrange

The current canvas also supports:

- panning
- minimap display
- route drag creation
- node dragging

### Node Creation

Nodes can be created by:

- the `Add Node` control
- drag-based graph extension when creating a route to empty space

The first created node becomes the workflow start node by default.

### Selection Model

The editor has separate selection behavior for:

- nodes
- routes
- workflow context

The footer area of the canvas reflects the current selection context.

## Inspectors

### Node Inspector

Selecting a node opens the node inspector.

The node inspector currently supports:

- editing node id
- editing node label
- editing node handler
- marking a node as the workflow start node
- marking a node as an end node
- deleting the node

Apply/Cancel behavior is explicit. Inspector changes are not committed until
applied.

### Route Inspector

Selecting a route opens the route inspector.

The route inspector currently supports:

- viewing route type
- changing the target node
- renaming a named route
- deleting the route

The route inspector is also used during pending connection creation so that new
connections do not rely on browser modal prompts.

## TOML Editing

The right-side TOML panel is editable.

Current behavior:

- graph changes regenerate the TOML
- TOML edits may be applied back into the graph
- applying TOML rebuilds the in-memory graph representation

Supported schema elements include:

- `workflow`
- `startNode`
- `[nodes.<id>]`
- `[continue]`
- `[routing.<from>.<route>]`

Node-level TOML fields currently relevant to the editor include:

- `type`
- `label`
- `handler`
- `description`

If `label` is omitted, the editor falls back to the node id.

## Workflow Naming

The editor reads the workflow name from the root-level TOML field:

```toml
workflow = "policy-underwriting"
```

If no workflow name is present, the editor falls back to `unnamed`.

## Themes

The editor currently supports:

- light theme
- midnight theme

Theme selection is available through the settings utility panel.

## File Utilities

The current utility panel includes workflow file actions for:

- loading from TOML currently present in the editor
- downloading generated TOML

These are local editor interactions rather than remote persistence features.

## Development Quickstart

From the repository root:

```bash
cd editor
npm install
npm run dev
```

The Vite dev server will print the local URL.

## Current Limitations

The editor is intentionally still a prototype-quality authoring tool.

Current limitations include:

- no backend persistence
- no multi-user collaboration
- no runtime execution trace view
- no validator integration pane yet
- no file system save/load outside browser-oriented utility flows

## Intended Direction

The editor is meant to become the visual authoring surface for the broader
Forerunner ecosystem:

- TOML workflow definitions
- future validator integration
- future CLI-driven workflow tooling
- eventual richer authoring and inspection workflows
