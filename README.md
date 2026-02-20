
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
No external runtime dependencies beyond the JVM and Kotlin standard library.

License: [MIT](LICENSE)

---

## Quick Mental Model

A workflow is a directed graph of nodes.

Each node:

1. Receives a context
2. Returns a routing decision (`NodeOutcome`)
3. The engine walks the graph deterministically until completion

Core flow:

```

Node → NodeOutcome → Workflow → WorkflowEngine → ExecutionResult

```

The engine contains no global state and performs no hidden magic.  
Execution is explicit and predictable.

---

# Core Concepts

## Node<C>

A workflow step that receives a context and returns a `NodeOutcome<C>`.

```kotlin
fun interface Node<C> {
    fun execute(context: C): NodeOutcome<C>
}
```

---

## NodeOutcome<C>

A node may return:

* `Continue(context, violations)`
  Continue using default routing from the current node.

* `Next(context, nextNodeId, violations)`
  Jump directly to a specific node.

* `Stop(context, violations)`
  Finish successfully.

* `Fatal(context, error)`
  Terminate execution due to fatal error.

Routing decisions are explicit and deterministic.

---

## Workflow<C>

Defines a directed graph:

* `startNode` — entry node
* `nodes` — map of id → node
* `continueTo` — routing for `Continue`

Each node is identified by a unique string key.

The `startNode` must match one of the defined node identifiers.

Java-friendly constructor:

```kotlin
Workflow(startNode, nodes)
```

Workflows are immutable after construction.

---

## WorkflowEngine

Executes a workflow from an initial context:

```kotlin
class WorkflowEngine(
    private val config: EngineConfig = EngineConfig()
)
```

`WorkflowEngine` is stateless and can execute any `Workflow`.

Execution signature:

```kotlin
engine.execute(workflow, context)
```

---

## EngineConfig

* `failFastOnError`
  If `true`, execution stops immediately when a `Severity.ERROR` violation is encountered.

* `maxSteps`
  Safety guard against infinite loops (default `10_000`).

Example:

```kotlin
val engine = WorkflowEngine(
    EngineConfig(
        failFastOnError = true,
        maxSteps = 5_000
    )
)
```

Java:

```java
EngineConfig cfg = new EngineConfig(true, 5_000);
WorkflowEngine engine = new WorkflowEngine(cfg);
```

---

## ExecutionResult<C>

Execution produces one of:

* `Completed(context, violations)`
* `ValidationFailed(context, violations)`
* `Fatal(context, error, violations)`

`ExecutionResult` is a sealed type and supports structured pattern handling via `when` (Kotlin) or `fold()` (JVM languages).

---

# Execution Semantics

For each step:

1. Guard against exceeding `maxSteps`
2. Resolve current node (fatal if missing)
3. Execute node (exception → `Fatal`)
4. Process outcome

| Outcome    | Behavior                                                            |
| ---------- | ------------------------------------------------------------------- |
| `Fatal`    | Return fatal result                                                 |
| `Stop`     | Append violations and return `Completed`                            |
| `Continue` | Append violations, optional fail-fast check, route via `continueTo` |
| `Next`     | Append violations, optional fail-fast check, route to explicit node |

If `Continue` has no `continueTo` mapping, execution ends as `Completed`.

---

# Usage

## Kotlin

### Object-Based Construction

```kotlin
import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine

data class IntContext(val value: Int)

val workflow = Workflow(
    startNode = "addTen",
    nodes = mapOf(
        "addTen" to Node { ctx ->
            NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
        },
        "multiplyByTwo" to Node { ctx ->
            NodeOutcome.stop(ctx.copy(value = ctx.value * 2))
        }
    ),
    continueTo = mapOf("addTen" to "multiplyByTwo")
)

val engine = WorkflowEngine()
val result = engine.execute(workflow, IntContext(5))

when (result) {
    is ExecutionResult.Completed ->
        println("Completed: ${result.context.value}")

    is ExecutionResult.ValidationFailed ->
        println("Validation failed: ${result.violations}")

    is ExecutionResult.Fatal ->
        println("Fatal error: ${result.error.message}")
}
```

### Using `fold()`

```kotlin
result.fold(
    onCompleted = { println("Completed via fold: ${it.context.value}") },
    onValidationFailed = { println("Validation failed via fold: ${it.violations}") },
    onFatal = { println("Fatal via fold: ${it.error.message}") }
)
```

---

## Fluent Construction (FlowBuilder)

```kotlin
import biz.digitalindustry.workflow.dsl.FlowBuilder

val flow = FlowBuilder.start<IntContext>("addTen")
    .node("addTen") { ctx ->
        continueWith { it.copy(value = it.value + 10) }
    }
    .then("multiplyByTwo") {
        stop { it.copy(value = it.value * 2) }
    }
    .build()
```

`.then()` defines default continue routing.
Dynamic branching uses `NodeOutcome.next(...)`.

---

# Java Usage

Forerunner is fully JVM-compatible.

### Object-Based Construction

```java
Workflow<IntContext> workflow =
    new Workflow<>(
        "addTen",
        Map.of(
            "addTen", ctx ->
                NodeOutcome.continueWith(ctx.withValue(ctx.value + 10)),
            "multiplyByTwo", ctx ->
                NodeOutcome.stop(ctx.withValue(ctx.value * 2))
        ),
        Map.of("addTen", "multiplyByTwo")
    );

WorkflowEngine engine = new WorkflowEngine();
var result = engine.execute(workflow, new IntContext(5));
```

### Handling Results

Using `instanceof`:

```java
if (result instanceof ExecutionResult.Completed<IntContext> completed) {
    System.out.println(completed.getContext());
}
```

Using `fold()`:

```java
result.fold(
    completed -> { System.out.println(completed.getContext()); return null; },
    failed -> { System.out.println(failed.getViolations()); return null; },
    fatal -> { System.out.println(fatal.getError()); return null; }
);
```

---

# Groovy Usage

Groovy closures map naturally to node execution.

### Object Model

```groovy
def workflow = new Workflow(
    "validate",
    [
        "validate": { ctx ->
            ctx.score < 600 ?
                NodeOutcome.stop(ctx) :
                NodeOutcome.next(ctx, "complete")
        },
        "complete": { ctx ->
            NodeOutcome.stop(ctx)
        }
    ]
)

def engine = new WorkflowEngine()
def result = engine.execute(workflow, new PolicyCtx(score: 700))

result.fold(
    { println("Completed: ${it.context}") },
    { println("Validation failed: ${it.violations}") },
    { println("Fatal: ${it.error}") }
)
```

---

# Thread Safety and Concurrency

Forerunner is fully thread-safe and reentrant.

### Workflow

* Immutable after construction
* Safe to share across threads
* Multiple threads may execute concurrently with separate contexts

### WorkflowEngine

* Stateless
* Not bound to a specific workflow
* Safe for concurrent execution

This is possible because:

* `Workflow` is immutable
* `WorkflowEngine.execute()` uses only method-local state
* `NodeOutcome` and `ExecutionResult` are immutable
* No global state or caching is used

---

# Design Constraints

* Domain-agnostic
* Deterministic execution
* Immutable context model
* Single default continue routing edge per node
* No framework coupling
* No reflection
* No hidden execution magic

---

# Build & Test

```bash
./gradlew test
```

---

Forerunner is intentionally JVM-first and designed for architectural clarity over convenience magic.
