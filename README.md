# Forerunner Workflow Engine

Forerunner is a small, pure Kotlin workflow engine for deterministic node-based execution.

It is designed around:
- Immutable context propagation
- Explicit routing (`Continue`, `Next`, `Stop`, `Fatal`)
- Violation accumulation (`WARNING` / `ERROR`)
- Optional fail-fast validation behavior

## Modules

- `workflow-engine`: core engine and public workflow abstractions
- `lucerna`: depends on `workflow-engine` (no Lucerna types leak into engine)

## Core Concepts

### `Node<C>`
A workflow step that receives a context and returns a `NodeOutcome<C>`.

```kotlin
interface Node<C> {
    val id: String
    fun execute(context: C): NodeOutcome<C>
}
```

### `NodeOutcome<C>`
A node can:
- `Continue(context, violations)`: continue using default edge from current node
- `Next(context, nextNodeId, violations)`: jump directly to a specific node
- `Stop(context, violations)`: finish successfully
- `Fatal(context, error)`: finish with fatal error

### `Workflow<C>`
Defines a graph:
- `startNodeId`: entry node
- `nodes`: id -> node map
- `defaultEdges`: default routing for `Continue`

### `WorkflowEngine<C>`
Executes a workflow from an initial context:

```kotlin
class WorkflowEngine<C>(
    private val workflow: Workflow<C>,
    private val config: EngineConfig = EngineConfig()
)
```

### `EngineConfig`
- `failFastOnError`: if `true`, return `ValidationFailed` when any accumulated `Severity.ERROR` appears during `Continue`/`Next`
- `maxSteps`: safety guard against infinite loops (default `10_000`)

### `ExecutionResult<C>`
- `Completed(context, violations)`
- `ValidationFailed(context, violations)`
- `Fatal(context, error, violations)`

## Execution Semantics

For each step:
1. Guard: if `steps++ > maxSteps` -> `Fatal("Max steps exceeded")`
2. Resolve current node by id; if missing -> `Fatal("Node not found: <id>")`
3. Execute node in `try/catch`; thrown exception -> `Fatal`
4. Handle outcome:
- `Fatal`: return fatal result
- `Stop`: append violations and return completed
- `Continue`: append violations, optional fail-fast check, then route via `defaultEdges[currentNodeId]`
- `Next`: append violations, optional fail-fast check, then route to `nextNodeId`

If `Continue` has no default edge, execution ends as `Completed`.

## Usage

### Object-Based Construction

```kotlin
import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.engine.WorkflowEngine

data class IntContext(val value: Int)

class AddTenNode : Node<IntContext> {
    override val id = "addTen"
    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Continue(context.copy(value = context.value + 10))
    }
}

class MultiplyByTwoNode : Node<IntContext> {
    override val id = "multiplyByTwo"
    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Stop(context.copy(value = context.value * 2))
    }
}

val workflow = Workflow(
    startNodeId = "addTen",
    nodes = mapOf(
        "addTen" to AddTenNode(),
        "multiplyByTwo" to MultiplyByTwoNode()
    ),
    defaultEdges = mapOf("addTen" to "multiplyByTwo")
)

val result = WorkflowEngine(workflow).execute(IntContext(5))
// Completed with context.value == 30
```

### DSL Construction (`workflow {}`)

```kotlin
import biz.digitalindustry.workflow.dsl.Continue
import biz.digitalindustry.workflow.dsl.Stop
import biz.digitalindustry.workflow.dsl.workflow

data class IntContext(val value: Int)

val flow = workflow<IntContext>(start = "addTen") {
    node("addTen") { ctx ->
        Continue(ctx.copy(value = ctx.value + 10))
    } then "multiplyByTwo"

    node("multiplyByTwo") { ctx ->
        Stop(ctx.copy(value = ctx.value * 2))
    }
}
```

Chained routing is supported:

```kotlin
node("a") { ctx -> Continue(ctx) } then "b" then "c"
```

## Canonical Examples in Tests

Implemented under:
- `workflow-engine/src/test/kotlin/biz/digitalindustry/workflow/engine/WorkflowExamplesTest.kt`

Includes:
- Linear transformation flow
- Branching validation flow
- Mixed routing + validation accumulation

Each example is validated in both object-based and DSL form.

## Build and Test

From repository root:

```bash
./gradlew :workflow-engine:test
./gradlew :lucerna:build
```

## Design Constraints

- Engine is domain-agnostic and side-effect free except for node execution logic you supply.
- No external runtime dependencies are required beyond Kotlin/Gradle defaults.
- No Lucerna domain types are introduced into `workflow-engine`.
