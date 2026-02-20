
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

Node → NodeOutcome → Workflow → WorkflowEngine → ExecutionResult

Forerunner is designed around:

- Immutable context propagation
- Explicit routing (`Continue`, `Next`, `Stop`, `Fatal`)
- Structured violation accumulation (`WARNING` / `ERROR`)
- Optional fail-fast validation behavior
- Deterministic graph execution

## Using Forerunner from Java

Forerunner is fully JVM-compatible and can be used cleanly from Java.
The core API avoids Kotlin-specific constructs and provides Java-friendly factory methods.

---

# Core Components

## `Node<C>`

A workflow step that receives a context and returns a `NodeOutcome<C>`.

```kotlin
fun interface Node<C> {
    fun execute(context: C): NodeOutcome<C>
}
```

---

## `Context (C)`

`C` is your workflow context type: the data each node reads and transforms.
It can be any arbitrary type you define (data class, class, record-like model, etc.).

- `Workflow<C>` defines the context type for the whole workflow.
- `WorkflowEngine.execute(workflow, initialContext)` starts execution with an initial `C`.
- `NodeOutcome` carries the next context value forward.
- `ExecutionResult<C>` returns the final context and accumulated violations.

For predictable behavior, prefer immutable context objects and use a new
context instance per execution.

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

### Kotlin DSL Sugar

In addition to returning `NodeOutcome` directly, nodes may use the DSL
helper functions (`stop`, `next`, `continueWith`, `fatal`) to define
outcomes declaratively. This improves readability while preserving
the same execution semantics.

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

---

## `Workflow<C>`

Defines a directed graph:

- `startNode` — entry node
- `nodes` — map of id → node
- `continueTo` — routing for `Continue`

### Starting Node

Each workflow defines a `startNode`, which is the unique identifier of the first node to execute.

Nodes are identified by a unique string key within the workflow. The `startNode` must match one of those node identifiers.

Java-friendly constructor is also available:

```kotlin
Workflow(startNode, nodes)
```

### Workflow and Node Java Compatibility

- `Node` is a functional interface.
- `NodeOutcome` exposes `@JvmStatic` factory methods.
- `Workflow` includes a Java-friendly constructor overload.
- `fold` is a Java friendly method for handling results

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

## `WorkflowEngine`

Executes a workflow from an initial context:

```kotlin
class WorkflowEngine(
    private val config: EngineConfig = EngineConfig()
)
```

### Execution Semantics

`WorkflowEngine` is a stateless executor capable of running any `Workflow`.
The generic type parameter is defined by the `Workflow` passed into `execute`.

Example:
- If your context is `PolicyCtx`, use `Workflow<PolicyCtx>` and `engine.execute(workflow, context)`.


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

### Using the Workflow Engine in Kotlin

Kotlin usage is direct: construct a workflow, execute it with `WorkflowEngine`,
and handle `ExecutionResult` with `when` or `fold`.

```kotlin
val engine = WorkflowEngine()
val result = engine.execute(workflow, IntContext(5))
```

### Using the Workflow Engine from Java

Java follows the same execution flow: create a `WorkflowEngine`, call
`execute(workflow, context)`, and handle the typed `ExecutionResult`.

```java
WorkflowEngine engine = new WorkflowEngine();
var result = engine.execute(workflow, new IntContext(5));

```

### Using the Workflow Engine from Groovy

The engine is fully JVM-compatible and can be used directly from Groovy.
Groovy closures map naturally to node execution functions, and both object-model
and fluent builder styles are supported.

```groovy
def engine = new WorkflowEngine()
def result = engine.execute(workflow, new PolicyCtx(score: 650, status: "PENDING"))
```

---

## `EngineConfig`

- `failFastOnError`  
  If `true`, execution stops immediately when a `Severity.ERROR` violation is encountered during `Continue` or `Next`.

- `maxSteps`  
  Safety guard against infinite loops (default `10_000`).

Fail-fast detection is optimized internally to avoid repeated violation scanning.

Configure the engine by passing `EngineConfig` as the second constructor argument:

```kotlin
val engine = WorkflowEngine(
    EngineConfig(
        failFastOnError = true,
        maxSteps = 5_000
    )
)
```

Java example:

```java
EngineConfig cfg = new EngineConfig(true, 5_000);
WorkflowEngine engine = new WorkflowEngine(cfg);
```

---

## `ExecutionResult<C>`

- `Completed(context, violations)`
- `ValidationFailed(context, violations)`
- `Fatal(context, error, violations)`

### Handling Results in Kotlin

In Kotlin, use an exhaustive `when` expression over `ExecutionResult` to keep
success, validation, and fatal paths explicit and strongly typed.

```kotlin
val result = engine.execute(workflow, context)

when (result) {
    is ExecutionResult.Completed -> {
        println("Completed: ${result.context}")
    }
    is ExecutionResult.ValidationFailed -> {
        println("Validation failed: ${result.violations}")
    }
    is ExecutionResult.Fatal -> {
        println("Fatal: ${result.error.message}")
    }
}
```

### Handling results in Java

Java usage follows the same structure as Kotlin: define the workflow, execute it
through `WorkflowEngine`, and handle the returned `ExecutionResult`.

Since `ExecutionResult` is a sealed class, Java uses `instanceof`:

```java
var result = engine.execute(workflow, context);

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

### Handling Results Using `fold`

to enable a cleaner handling of results in Java and other JVM languages like Groovy, Forerunner provides the fold method on the ExecutionResult

Java example:

```java
result.fold(
    completed -> {
        System.out.println("Completed: " + completed.getContext());
        return null;
    },
    failed -> {
        System.out.println("Validation failed: " + failed.getViolations());
        return null;
    },
    fatal -> {
        System.out.println("Fatal: " + fatal.getError().getMessage());
        return null;
    }
);
```

Groovy example:

```groovy
result.fold(
        { completed ->
            println("Completed via fold: ${completed.context.status}")
        },
        { failed ->
            println("Validation failed via fold: ${failed.violations}")
        },
        { fatal ->
            println("Fatal via fold: ${fatal.error.message}")
        }
)
```

---

## `Violation`

Violations represent non-fatal rule outcomes produced by nodes and accumulated during execution.

- `code` — stable machine-readable identifier (for routing, analytics, or API handling)
- `message` — human-readable explanation
- `severity` — `WARNING` or `ERROR` (`ERROR` by default)

Nodes can attach violations to `Continue`, `Next`, or `Stop` outcomes.  
The engine aggregates violations in order and returns them in `ExecutionResult`.

### Using Violations from Kotlin

In Kotlin, violations are typically created directly (or via companion helpers)
and attached to `NodeOutcome` values returned by nodes.

```kotlin
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation

val warning = Violation("POL002", "Premium unusually low", Severity.WARNING)
val error = Violation.error("POL001", "Invalid age")

NodeOutcome.continueWith(
    ctx,
    listOf(warning, error)
)
```

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

# Usage

The engine performs no implicit branching, reflection, or dynamic rule evaluation.
All transitions are explicit.

---

## Quick Example using Object Model

### Kotlin Implementation

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
    is ExecutionResult.Completed -> {
        println("Completed: ${result.context}")
    }
    is ExecutionResult.ValidationFailed -> {
        println("Validation failed: ${result.violations}")
    }
    is ExecutionResult.Fatal -> {
        println("Fatal: ${result.error.message}")
    }
}
```

### Java Implementation

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

WorkflowEngine engine = new WorkflowEngine();
var result = engine.execute(workflow, new IntContext(5));

result.fold(
        completed -> {
        System.out.println("Completed: " + completed.getContext());
        return null;
        },
failed -> {
        System.out.println("Validation failed: " + failed.getViolations());
        return null;
        },
fatal -> {
        System.out.println("Fatal: " + fatal.getError().getMessage());
        return null;
        }
        );
````

### Groovy Implementation

```groovy
import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import biz.digitalindustry.workflow.model.Violation

class PolicyCtx {
    int score
    String status
}

def workflow = new Workflow<PolicyCtx>(
    "validate",
    [
        "validate": new Node<PolicyCtx>({ PolicyCtx ctx ->
            if (ctx.score < 600) {
                NodeOutcome.stop(
                    new PolicyCtx(score: ctx.score, status: "REJECTED"),
                    [Violation.error("UW_LOW_SCORE", "Score below threshold")]
                )
            } else {
                NodeOutcome.next(
                    new PolicyCtx(score: ctx.score, status: "APPROVED"),
                    "complete"
                )
            }
        }),
        "complete": new Node<PolicyCtx>({ PolicyCtx ctx ->
            NodeOutcome.stop(ctx)
        })
    ]
)

def engine = new WorkflowEngine()
def result = engine.execute(workflow, new PolicyCtx(score: 650, status: "PENDING"))

result.fold(
        { completed ->
            println("Completed via fold: ${completed.context.status}")
        },
        { failed ->
            println("Validation failed via fold: ${failed.violations}")
        },
        { fatal ->
            println("Fatal via fold: ${fatal.error.message}")
        }
)
```

# Fluent Workflow Construction (FlowBuilder)

Forerunner includes a fluent builder for defining workflows without directly constructing maps.

```kotlin
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.dsl.FlowBuilder
```

---

## Sequential Flow Using `.then(...)`

Using `.then()` when defining a flow. This example intentionally shows a linear flow defined in a non-linear fashion. This is simply to illustrate how the api functions.

```kotlin
data class IntContext(val value: Int)

val flow = FlowBuilder.start<IntContext>("addTen")
    .node("addTen") { ctx ->
        NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
    }
    .then("multiplyByTwo")
    .node("addFive") { ctx ->
        NodeOutcome.stop(ctx.copy(value = ctx.value +5))
    }
    .node("multiplyByTwo") { ctx ->
        NodeOutcome.continueWith(ctx.copy(value = ctx.value * 2))
    }
    .then("addFive")
    .build()
```

`.then()` reads naturally for sequential pipelines.

---

### Chained Node Definition with `then(nodeId, block)`

for sequential flows, .then supports a compact syntax to chain nodes together. This allows for a cleaner definition of nodes in a sequential flow

```kotlin
val flow = FlowBuilder.start<IntContext>("addTen")
    .node("addTen") { ctx ->
        NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
    }
    .then("multiplyByTwo") { ctx ->
        NodeOutcome.stop(ctx.copy(value = ctx.value * 2))
    }
    .build()
```

### Java Implementation

The fluent builder also works from Java.

```java
import biz.digitalindustry.workflow.dsl.FlowBuilder;

Workflow<IntContext> workflow =
    FlowBuilder.<IntContext>start("addTen")
        .node("addTen", ctx ->
            NodeOutcome.continueWith(ctx.withValue(ctx.value + 10))
        )
        .then("multiplyByTwo", ctx ->
            NodeOutcome.stop(ctx.withValue(ctx.value * 2))
        )
        .build();
```

### Groovy Example

and Groovy...

```groovy
import biz.digitalindustry.workflow.dsl.FlowBuilder

class PolicyCtx {
    int score
    String status
}

def workflow = FlowBuilder.<PolicyCtx>start("validate")
    .node("validate") { PolicyCtx ctx ->
        if (ctx.score < 600) {
            NodeOutcome.stop(new PolicyCtx(score: ctx.score, status: "REJECTED"))
        } else {
            NodeOutcome.next(new PolicyCtx(score: ctx.score, status: "APPROVED"), "complete")
        }
    }
    .then("complete") { PolicyCtx ctx ->
        NodeOutcome.stop(ctx)
    }
    .build()
```

---

# Complex Graph Examples

Forerunner workflows are directed graphs. Nested or hierarchical behavior is modeled through routing — not parent/child objects.


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

### Kotlin Implementation

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

## Multi-stage underwriting flow with nested validation branches.

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

### Kotlin Implementation

```kotlin
data class PolicyCtx(
    val requiresRiskReview: Boolean,
    val isHighRisk: Boolean,
    val isLoyalCustomer: Boolean,
    val premium: Double,
    val status: String = "PENDING"
)

val workflow = Workflow(
    startNode = "underwrite",

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

# Defining Reusable Workflows

Workflows are simple value definitions and do not require inheritance.
Instead of subclassing `Workflow`, define reusable workflows using
composition. This keeps workflows immutable, thread-safe, and easy to test.

### Kotlin Implementation

```kotlin
object UnderwritingWorkflows {
    fun defaultWorkflow(): Workflow<Policy> {
        return Workflow(
            startNode = "underwrite",
            nodes = mapOf(
                "underwrite" to UnderwriteRule(),
                "fraudcheck" to FraudCheck()
            )
        )
    }
}

class UnderwriteRule : Node<Policy> {
    override fun execute(context: Policy): NodeOutcome<Policy> {
        return if (context.score < 600) {
            NodeOutcome.stop(
                context,
                listOf(Violation.error("UW_LOW_SCORE", "Score below threshold"))
            )
        } else {
            NodeOutcome.next(context, "fraudcheck")
        }
    }
}

class FraudCheck : Node<Policy> {
    override fun execute(context: Policy): NodeOutcome<Policy> =
        NodeOutcome.stop(context)
}
```

### Java Implementation

Because `Workflow` is a Kotlin data class (and therefore final),
it is not designed for inheritance. Workflows are intended to be
defined via composition rather than subclassing.

```java
public final class UnderwritingWorkflows {

    private UnderwritingWorkflows() {
        // prevent instantiation
    }

    public static Workflow<Policy> defaultWorkflow() {
        return new Workflow<>(
            "underwrite",
            Map.of(
                "underwrite", new UnderwriteRule(),
                "fraudcheck", new FraudCheck()
            )
        );
    }
}

public class UnderwriteRule implements Node<Policy> {

    @Override
    public NodeOutcome<Policy> execute(Policy context) {
        if (context.getScore() < 600) {
            return NodeOutcome.stop(
                context,
                List.of(Violation.error("UW_LOW_SCORE", "Score below threshold"))
            );
        }
        return NodeOutcome.next(context, "fraudcheck");
    }
}

class FraudCheck implements Node<Policy> {
    @Override
    public NodeOutcome<Policy> execute(Policy context) {
        return NodeOutcome.stop(context);
    }
}
```

---

# Design Objectives

- Domain-agnostic
- Deterministic execution
- Immutable context model
- Single default continue routing edge per node
- No external runtime dependencies
- No framework coupling
- Fluent builder is optional — core engine remains independent

### Design Notes

* `Node` is a Java-compatible functional interface.
* `NodeOutcome` exposes static factory methods (`continueWith`, `next`, `stop`, `fatal`).
* `Workflow` provides constructor overloads for clean Java usage.
* `EngineConfig` has a no-argument constructor.
* No Kotlin DSL is required to use the engine.

Forerunner is intentionally designed to be JVM-first and usable from Kotlin, Java, or any other JVM language.


## Thread Safety and Concurrency

Forerunner is designed to be fully thread-safe and reentrant.

### Workflow

- A `Workflow` instance is immutable after construction.
- A single `Workflow` may be safely shared across threads.
- Multiple threads may execute the same workflow concurrently using different context instances.

### WorkflowEngine

- `WorkflowEngine` is stateless.
- It is not bound to a specific workflow.
- A single engine instance may execute any number of different workflow definitions.
- Multiple threads may safely call:

```java
engine.execute(workflow, context);
```

concurrency without synchronization.

### Why This Is Safe

* `Workflow` is immutable.
* `WorkflowEngine.execute()` uses only method-local state.
* `NodeOutcome` and `ExecutionResult` are immutable.
* The engine does not use global state, caching, or shared mutable data.

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
