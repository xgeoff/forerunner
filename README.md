
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
