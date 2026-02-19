
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
fun interface Node<C> {
    fun execute(context: C): NodeOutcome<C>
}
```

---

## `NodeOutcome<C>`

A node may return:

- `Continue(context, violations)`  
  Continue using default continue routing from the current node.

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
- `continueTo` — routing for `Continue`

Java-friendly constructor is also available:

```kotlin
Workflow(startNodeId, nodes)
```

---

## Java Compatibility

- `Node` is a functional interface.
- `NodeOutcome` exposes `@JvmStatic` factory methods.
- `Workflow` includes a Java-friendly constructor overload.

```java
Workflow<MyCtx> wf = new Workflow<>(
    "start",
    Map.of(
        "start", ctx -> NodeOutcome.next(ctx, "end"),
        "end", ctx -> NodeOutcome.stop(ctx)
    )
);
```

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

Fail-fast detection is optimized internally to avoid repeated violation scanning.

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
| `Continue`| Append violations, optional fail-fast check, route via `continueTo` |
| `Next`    | Append violations, optional fail-fast check, route to explicit node |

If `Continue` has no `continueTo` mapping, execution ends as `Completed`.

---

# Usage

## Object-Based Construction

```kotlin
import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.engine.WorkflowEngine

data class IntContext(val value: Int)

val workflow = Workflow(
    startNodeId = "addTen",
    nodes = mapOf(
        "addTen" to Node { ctx: IntContext ->
            NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
        },
        "multiplyByTwo" to Node { ctx: IntContext ->
            NodeOutcome.stop(ctx.copy(value = ctx.value * 2))
        }
    ),
    continueTo = mapOf("addTen" to "multiplyByTwo")
)

val result = WorkflowEngine(workflow)
    .execute(IntContext(5))

// Completed with context.value == 30
```

## Complex Graph Example (Object Model)

Forerunner workflows are directed graphs. Nested or hierarchical behavior is modeled through routing — not parent/child objects.

Example: multi-stage underwriting flow with nested validation branches.

### Graph Shape

```
underwrite
   ├── riskCheck
   │       ├── fraudCheck
   │       └── creditCheck
   └── eligibilityCheck
           └── ageCheck
→ price
   ├── loyaltyDiscount
   └── highRiskSurcharge
→ issue
```

### Implementation

```kotlin
data class PolicyCtx(
    val requiresRiskReview: Boolean,
    val isHighRisk: Boolean,
    val isLoyalCustomer: Boolean,
    val premium: Double,
    val status: String = "PENDING"
)

val workflow = Workflow(
    startNodeId = "underwrite",

    nodes = mapOf(

        "underwrite" to Node { ctx: PolicyCtx ->
            if (ctx.requiresRiskReview)
                NodeOutcome.next(ctx, "riskCheck")
            else
                NodeOutcome.next(ctx, "eligibilityCheck")
        },

        "price" to Node { ctx ->
            when {
                ctx.isHighRisk ->
                    NodeOutcome.next(ctx, "highRiskSurcharge")

                ctx.isLoyalCustomer ->
                    NodeOutcome.next(ctx, "loyaltyDiscount")

                else ->
                    NodeOutcome.continueWith(ctx)
            }
        },

        "issue" to Node { ctx ->
            NodeOutcome.stop(ctx.copy(status = "ISSUED"))
        },

        "riskCheck" to Node { ctx -> NodeOutcome.continueWith(ctx) },
        "fraudCheck" to Node { ctx -> NodeOutcome.continueWith(ctx) },
        "creditCheck" to Node { ctx -> NodeOutcome.continueWith(ctx) },

        "eligibilityCheck" to Node { ctx -> NodeOutcome.continueWith(ctx) },
        "ageCheck" to Node { ctx -> NodeOutcome.continueWith(ctx) },

        "loyaltyDiscount" to Node { ctx ->
            NodeOutcome.continueWith(ctx.copy(premium = ctx.premium * 0.9))
        },

        "highRiskSurcharge" to Node { ctx ->
            NodeOutcome.continueWith(ctx.copy(premium = ctx.premium * 1.2))
        }
    ),

    continueTo = mapOf(

        // Underwriting branch
        "riskCheck" to "fraudCheck",
        "fraudCheck" to "creditCheck",
        "creditCheck" to "price",

        "eligibilityCheck" to "ageCheck",
        "ageCheck" to "price",

        // Pricing branch
        "loyaltyDiscount" to "issue",
        "highRiskSurcharge" to "issue",

        "price" to "issue"
    )
)
```

In this model:

- Nodes define behavior only.
- `continueTo` defines fallback routing for `Continue`.
- `NodeOutcome.next(...)` performs runtime branching.
- Complex nested flows are expressed purely as graph structure.

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
        NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
    }
    .then("multiplyByTwo")
    .node("multiplyByTwo") { ctx ->
        NodeOutcome.stop(ctx.copy(value = ctx.value * 2))
    }
    .build()
```

`.then()` reads naturally for sequential pipelines.

---

## Branching Graph with Default Edge + Runtime Next

Use `.then()` to define default continue routing for `Continue`, and `NodeOutcome.next(...)` for runtime branching.

Example: a validation step that may branch at runtime, but still has defined default continue routing.

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
            NodeOutcome.next(ctx, "highRisk")   // runtime branch
        else
            NodeOutcome.continueWith(ctx)           // fallback
    }
    .then("standard")   // default continue routing for Continue

    .node("highRisk") { ctx ->
        ctx.path.add("highRisk")
        NodeOutcome.continueWith(ctx)
    }
    .then("finalize")

    .node("standard") { ctx ->
        ctx.path.add("standard")
        NodeOutcome.continueWith(ctx)
    }
    .then("finalize")

    .node("finalize") { ctx ->
        ctx.path.add("finalize")
        NodeOutcome.stop(ctx)
    }

    .build()
```

In this example:

- `.then("standard")` defines default continue routing for `Continue`.
- `NodeOutcome.next(...)` performs runtime branching and can override that default at execution time.
- `.then("finalize")` expresses simple sequential routing.

---

`.then()` defines default continue routing for `Continue`.  
Dynamic jumps are performed via `NodeOutcome.next(...)`.

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
- Single default continue routing edge per node
- No external runtime dependencies
- No framework coupling
- Fluent builder is optional — core engine remains independent

Here is a clean section you can copy directly into your `README.md`.

---

## Using Forerunner from Java

Forerunner is fully JVM-compatible and can be used cleanly from Java.
The core API avoids Kotlin-specific constructs and provides Java-friendly factory methods.

---

### Object-Based Construction (Java)

Because `Node` is a functional interface and `NodeOutcome` exposes static factories, Java usage is straightforward.

```java
import biz.digitalindustry.workflow.core.Node;
import biz.digitalindustry.workflow.core.NodeOutcome;
import biz.digitalindustry.workflow.core.Workflow;
import biz.digitalindustry.workflow.engine.WorkflowEngine;

import java.util.Map;

class IntContext {
    final int value;

    IntContext(int value) {
        this.value = value;
    }

    IntContext withValue(int newValue) {
        return new IntContext(newValue);
    }
}

Workflow<IntContext> workflow =
    new Workflow<>(
        "addTen",
        Map.of(
            "addTen", (Node<IntContext>) ctx ->
                NodeOutcome.continueWith(ctx.withValue(ctx.value + 10)),

            "multiplyByTwo", ctx ->
                NodeOutcome.stop(ctx.withValue(ctx.value * 2))
        ),
        Map.of(
            "addTen", "multiplyByTwo"
        )
    );

WorkflowEngine<IntContext> engine =
    new WorkflowEngine<>(workflow);

var result = engine.execute(new IntContext(5));
````

---

### Fluent `FlowBuilder` Construction (Java)

The fluent builder also works from Java.

```java
import biz.digitalindustry.workflow.dsl.FlowBuilder;

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

### Using Violations from Java

`Violation` provides static helpers for clarity:

```java
import biz.digitalindustry.workflow.model.Violation;

Violation error = Violation.error("POL001", "Invalid age");
Violation warning = Violation.warning("POL002", "Premium unusually low");
```

Nodes can return violations like this:

```java
NodeOutcome.continueWith(ctx, List.of(
    Violation.error("POL001", "Invalid age")
));
```

---

### Handling Results in Java

Since `ExecutionResult` is a sealed class, Java uses `instanceof`:

```java
var result = engine.execute(context);

if (result instanceof ExecutionResult.Completed<IntContext> completed) {
    IntContext finalCtx = completed.getContext();
}

else if (result instanceof ExecutionResult.ValidationFailed<IntContext> failed) {
    var violations = failed.getViolations();
}

else if (result instanceof ExecutionResult.Fatal<IntContext> fatal) {
    Throwable error = fatal.getError();
}
```

---

### Design Notes

* `Node` is a Java-compatible functional interface.
* `NodeOutcome` exposes static factory methods (`continueWith`, `next`, `stop`, `fatal`).
* `Workflow` provides constructor overloads for clean Java usage.
* `EngineConfig` has a no-argument constructor.
* No Kotlin DSL is required to use the engine.

Forerunner is intentionally designed to be JVM-first and usable from Kotlin, Java, or any other JVM language.

Here is a clean section you can paste directly into your `README.md`.

---

## Thread Safety

Forerunner is designed to be thread-safe and reentrant.

### What This Means

- A single `Workflow` instance can be shared safely across threads.
- A single `WorkflowEngine` instance can execute multiple workflows concurrently.
- Multiple threads can call `engine.execute(context)` at the same time without synchronization.

This is possible because:

- `Workflow` is immutable after construction.
- `WorkflowEngine.execute()` uses only method-local state.
- `NodeOutcome` and `ExecutionResult` are immutable.
- The engine does not use global state, caching, or shared mutable data.

---

### Important Considerations

Thread safety depends on how you implement your nodes and context:

- Nodes should be stateless or otherwise thread-safe.
- Context objects should not contain shared mutable state.
- If your context contains mutable collections or objects, avoid sharing them across executions.

For example:

```kotlin
data class Policy(
    val premium: BigDecimal,
    val coverages: List<Coverage> // preferred over MutableList
)
```

Using immutable data structures ensures safe concurrent execution.

---

### Execution Model

Forerunner executes workflows sequentially within a single execution.

It does **not** perform parallel or asynchronous node execution by default.

Thread safety refers to concurrent executions, not parallel node processing within a single workflow run.

---

Forerunner is intentionally designed as a deterministic, stateless state machine engine suitable for use in high-concurrency server environments.

