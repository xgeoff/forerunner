
# Forerunner

**Forerunner** is a small, pure Kotlin workflow engine for deterministic, node-based execution.

It is designed around:

- Immutable context propagation
- Explicit routing (`Continue`, `Next`, `Stop`, `Fatal`)
- Structured violation accumulation (`WARNING` / `ERROR`)
- Optional fail-fast validation behavior
- Deterministic graph execution

No frameworks.  
No reflection.  
No runtime dependencies beyond Kotlin.

---

# Core Concepts

## `Node<C>`

A workflow step that receives a context and returns a `NodeOutcome<C>`.

```kotlin
interface Node<C> {
    val id: String
    fun execute(context: C): NodeOutcome<C>
}
```

---

## `NodeOutcome<C>`

A node may return:

- `Continue(context, violations)`  
  Continue using the default edge from the current node.

- `Next(context, nextNodeId, violations)`  
  Jump directly to a specific node.

- `Stop(context, violations)`  
  Finish successfully.

- `Fatal(context, error)`  
  Terminate execution due to fatal error.

---

## `Workflow<C>`

Defines a directed graph:

- `startNodeId` — entry node
- `nodes` — map of id → node
- `defaultEdges` — routing for `Continue`

---

## `WorkflowEngine<C>`

Executes a workflow from an initial context:

```kotlin
class WorkflowEngine<C>(
    private val workflow: Workflow<C>,
    private val config: EngineConfig = EngineConfig()
)
```

---

## `EngineConfig`

- `failFastOnError`  
  If `true`, execution stops immediately when a `Severity.ERROR` violation is encountered during `Continue` or `Next`.

- `maxSteps`  
  Safety guard against infinite loops (default `10_000`).

---

## `ExecutionResult<C>`

- `Completed(context, violations)`
- `ValidationFailed(context, violations)`
- `Fatal(context, error, violations)`

---

# Execution Semantics

For each step:

1. Guard against exceeding `maxSteps`
2. Resolve current node by id (fatal if missing)
3. Execute node in `try/catch` (exception → `Fatal`)
4. Handle outcome:

| Outcome   | Behavior |
|-----------|----------|
| `Fatal`   | Return fatal result |
| `Stop`    | Append violations and return `Completed` |
| `Continue`| Append violations, optional fail-fast check, route via default edge |
| `Next`    | Append violations, optional fail-fast check, route to explicit node |

If `Continue` has no default edge, execution ends as `Completed`.

---

# Usage

## Object-Based Construction

```kotlin
import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.engine.WorkflowEngine

data class IntContext(val value: Int)

class AddTenNode : Node<IntContext> {
    override val id = "addTen"

    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Continue(
            context.copy(value = context.value + 10)
        )
    }
}

class MultiplyByTwoNode : Node<IntContext> {
    override val id = "multiplyByTwo"

    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Stop(
            context.copy(value = context.value * 2)
        )
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

val result = WorkflowEngine(workflow)
    .execute(IntContext(5))

// Completed with context.value == 30
```

---

# Fluent Construction (FlowBuilder)

Forerunner includes a fluent builder for defining workflows without directly constructing maps.

```kotlin
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.dsl.FlowBuilder
```

---

## Sequential Flow Using `.then(...)`

Use `.then()` when defining a linear flow:

```kotlin
data class IntContext(val value: Int)

val flow = FlowBuilder.start<IntContext>("addTen")
    .node("addTen") { ctx ->
        NodeOutcome.Continue(ctx.copy(value = ctx.value + 10))
    }
    .then("multiplyByTwo")
    .node("multiplyByTwo") { ctx ->
        NodeOutcome.Stop(ctx.copy(value = ctx.value * 2))
    }
    .build()
```

`.then()` reads naturally for sequential pipelines.

---

## Branching Graph with Default Edge + Runtime Next

Use `.then()` to define the default edge for `Continue`, and `NodeOutcome.Next(...)` for runtime branching.

Example: a validation step that may branch at runtime, but still has a defined default route.

### Graph

```
validate
   ├── highRisk
   └── standard (default)
highRisk → finalize
standard → finalize
```

```kotlin
data class RiskContext(
    val score: Int,
    val path: MutableList<String> = mutableListOf()
)

val flow = FlowBuilder.start<RiskContext>("validate")

    .node("validate") { ctx ->
        ctx.path.add("validate")

        if (ctx.score > 80)
            NodeOutcome.Next(ctx, "highRisk")   // runtime branch
        else
            NodeOutcome.Continue(ctx)           // fallback
    }
    .then("standard")   // default edge for Continue

    .node("highRisk") { ctx ->
        ctx.path.add("highRisk")
        NodeOutcome.Continue(ctx)
    }
    .then("finalize")

    .node("standard") { ctx ->
        ctx.path.add("standard")
        NodeOutcome.Continue(ctx)
    }
    .then("finalize")

    .node("finalize") { ctx ->
        ctx.path.add("finalize")
        NodeOutcome.Stop(ctx)
    }

    .build()
```

In this example:

- `.then("standard")` defines the default edge for `Continue`.
- `NodeOutcome.Next(...)` performs runtime branching and can override that default at execution time.
- `.then("finalize")` expresses simple sequential routing.

---

`.then()` defines default routing for `Continue`.  
Dynamic jumps are performed via `NodeOutcome.Next(...)`.

---

# Canonical Test Scenarios

Complex graph examples are implemented under:

```
src/test/kotlin/biz/digitalindustry/workflow/
```

Covered scenarios include:

- Linear transformation flows
- Branching validation graphs
- Mixed default + runtime routing
- Validation accumulation
- Fail-fast behavior
- Loop protection via `maxSteps`

---

# Build & Test

From project root:

```bash
./gradlew test
```

---

# Design Constraints

- Domain-agnostic
- Deterministic execution
- Immutable context model
- Single default edge per node
- No external runtime dependencies
- No framework coupling
- Fluent builder is optional — core engine remains independent
