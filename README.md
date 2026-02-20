
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

# Quick Mental Model

A workflow is a directed graph of nodes.

Each node:

1. Receives a context
2. Returns a `NodeOutcome`
3. The engine walks the graph deterministically
4. Execution produces an `ExecutionResult`

Core flow:

```

Node → NodeOutcome → Workflow → WorkflowEngine → ExecutionResult

````

The engine performs no implicit branching, reflection, or dynamic rule evaluation.
All transitions are explicit.

---

# Quick Example (Kotlin)

```kotlin
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
        println(result.context.value) // 30
    else ->
        println("Unexpected result")
}
````

Now that you’ve seen it run, here is how it works internally.

---

# Core Types

## Node<C>

```kotlin
fun interface Node<C> {
    fun execute(context: C): NodeOutcome<C>
}
```

* Pure function from context → routing decision
* No hidden state
* No lifecycle callbacks
* No framework dependency

---

## NodeOutcome<C>

Defines explicit routing semantics.

A node returns one of:

* `Continue(context, violations)`
* `Next(context, nextNodeId, violations)`
* `Stop(context, violations)`
* `Fatal(context, error)`

### Continue

* Uses `continueTo` mapping for default routing.
* Allows violation accumulation.

### Next

* Performs explicit dynamic jump to another node.

### Stop

* Terminates successfully.

### Fatal

* Terminates immediately due to unrecoverable error.

There is no implicit fallback behavior.

---

## Workflow<C>

A workflow is a value object describing a directed graph.

```kotlin
Workflow(
    startNode: String,
    nodes: Map<String, Node<C>>,
    continueTo: Map<String, String>
)
```

### Properties

* `startNode` must exist in `nodes`
* `nodes` defines execution behavior
* `continueTo` defines default routing for `Continue`

Workflows are immutable after construction.

They are safe to share across threads.

---

## WorkflowEngine

```kotlin
class WorkflowEngine(
    private val config: EngineConfig = EngineConfig()
)
```

The engine:

* Is stateless
* Is not bound to a specific workflow
* Uses only method-local execution state
* Performs deterministic graph walking

Execution method:

```kotlin
engine.execute(workflow, context)
```

---

## EngineConfig

```kotlin
EngineConfig(
    failFastOnError: Boolean = false,
    maxSteps: Int = 10_000
)
```

### failFastOnError

Stops execution immediately if an `ERROR` violation is encountered.

### maxSteps

Prevents infinite loops.

---

## ExecutionResult<C>

Execution produces exactly one of:

* `Completed(context, violations)`
* `ValidationFailed(context, violations)`
* `Fatal(context, error, violations)`

It is a sealed hierarchy.

### Kotlin Handling

```kotlin
when (result) {
    is ExecutionResult.Completed -> { ... }
    is ExecutionResult.ValidationFailed -> { ... }
    is ExecutionResult.Fatal -> { ... }
}
```

### JVM-Friendly Handling (`fold()`)

```kotlin
result.fold(
    onCompleted = { ... },
    onValidationFailed = { ... },
    onFatal = { ... }
)
```

---

# Execution Semantics

For each step:

1. Guard against exceeding `maxSteps`
2. Resolve current node (fatal if missing)
3. Execute node (exceptions become `Fatal`)
4. Process outcome

| Outcome    | Behavior               |
| ---------- | ---------------------- |
| `Fatal`    | Immediate termination  |
| `Stop`     | Successful completion  |
| `Continue` | Route via `continueTo` |
| `Next`     | Route to explicit node |

If `Continue` has no mapping in `continueTo`, execution ends as `Completed`.

---

# Fluent Construction (FlowBuilder)

The fluent builder provides structured graph construction.

### Kotlin

```kotlin
val flow = FlowBuilder.start<IntContext>("addTen")
    .node("addTen") {
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

### Object Model

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
```

### Fluent Builder

```java
Workflow<IntContext> workflow =
    FlowBuilder.<IntContext>start("addTen")
        .node("addTen", ctx ->
            NodeOutcome.continueWith(ctx.withValue(ctx.value + 10))
        )
        .then("multiplyByTwo")
        .node("multiplyByTwo", ctx ->
            NodeOutcome.stop(ctx.withValue(ctx.value * 2))
        )
        .build();
```

---

# Groovy Usage

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
```

### Fluent Builder

```groovy
def workflow = FlowBuilder.start(PolicyCtx)
    .node("validate") { ctx ->
        ctx.score < 600 ?
            NodeOutcome.stop(ctx) :
            NodeOutcome.next(ctx, "complete")
    }
    .then("complete") { ctx ->
        NodeOutcome.stop(ctx)
    }
    .build()
```

---

# Thread Safety and Concurrency

Forerunner is fully thread-safe and reentrant.

* `Workflow` is immutable
* `WorkflowEngine` is stateless
* Execution uses method-local state only
* No global caches or shared mutable data

A single workflow and a single engine instance may be shared safely across threads.

---

# Design Constraints

* Domain-agnostic
* Deterministic execution
* Immutable context model
* Explicit routing only
* No reflection
* No hidden execution magic
* Fluent builder is optional — core engine remains independent

---

# Build & Test

```bash
./gradlew test
```

Forerunner prioritizes architectural clarity over implicit behavior.
