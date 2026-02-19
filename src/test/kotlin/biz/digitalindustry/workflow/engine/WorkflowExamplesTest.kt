package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class WorkflowExamplesTest {

    @Test
    fun linearTransformation_objectBased() {
        val workflow = Workflow(
            startNodeId = "addTen",
            nodes = mapOf(
                "addTen" to Node<IntContext> { ctx ->
                    NodeOutcome.Continue(ctx.copy(value = ctx.value + 10))
                },
                "multiplyByTwo" to Node<IntContext> { ctx ->
                    NodeOutcome.Stop(ctx.copy(value = ctx.value * 2))
                }
            ),
            continueTo = mapOf("addTen" to "multiplyByTwo")
        )

        val result = WorkflowEngine(workflow).execute(IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
        assertTrue(completed.violations.isEmpty())
    }

    @Test
    fun linearTransformation_fluentBuilder() {
        val workflow = WorkflowBuilder<IntContext>().apply {
            start("addTen")
            node("addTen") { ctx -> NodeOutcome.Continue(ctx.copy(value = ctx.value + 10)) }
            node("multiplyByTwo") { ctx -> NodeOutcome.Stop(ctx.copy(value = ctx.value * 2)) }
            edge("addTen", "multiplyByTwo")
        }.build()

        val result = WorkflowEngine(workflow).execute(IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
        assertTrue(completed.violations.isEmpty())
    }

    @Test
    fun branchingValidation_objectBased() {
        val workflow = Workflow(
            startNodeId = "validateAge",
            nodes = mapOf(
                "validateAge" to Node<UserContext> { context ->
                    if (context.age < 18) {
                        NodeOutcome.Stop(
                            context,
                            violations = listOf(Violation("AGE-001", "User must be at least 18"))
                        )
                    } else {
                        NodeOutcome.Stop(context)
                    }
                }
            )
        )

        val underage = WorkflowEngine(workflow).execute(UserContext(age = 17))
        val underageCompleted = assertIs<ExecutionResult.Completed<UserContext>>(underage)
        assertEquals(1, underageCompleted.violations.size)
        assertEquals("AGE-001", underageCompleted.violations.single().code)

        val adult = WorkflowEngine(workflow).execute(UserContext(age = 18))
        val adultCompleted = assertIs<ExecutionResult.Completed<UserContext>>(adult)
        assertTrue(adultCompleted.violations.isEmpty())
    }

    @Test
    fun branchingValidation_fluentInlineNode() {
        val workflow = WorkflowBuilder<UserContext>().apply {
            start("validateAge")
            node("validateAge") { context ->
                if (context.age < 18) {
                    NodeOutcome.Stop(
                        context,
                        violations = listOf(Violation("AGE-001", "User must be at least 18"))
                    )
                } else {
                    NodeOutcome.Stop(context)
                }
            }
        }.build()

        val result = WorkflowEngine(workflow).execute(UserContext(age = 16))

        val completed = assertIs<ExecutionResult.Completed<UserContext>>(result)
        assertEquals(1, completed.violations.size)
        assertEquals("AGE-001", completed.violations.single().code)
    }

    @Test
    fun mixedRoutingAndAccumulation_objectBased() {
        val workflow = Workflow(
            startNodeId = "validateTotal",
            nodes = mapOf(
                "validateTotal" to Node<OrderContext> { context ->
                    if (context.total <= 0) {
                        NodeOutcome.Continue(
                            context,
                            violations = listOf(Violation("ORD-001", "Total must be positive", Severity.ERROR))
                        )
                    } else {
                        NodeOutcome.Continue(context)
                    }
                },
                "discount" to Node<OrderContext> { context ->
                    if (context.total > 100) {
                        NodeOutcome.Continue(
                            context.copy(
                                total = context.total * 0.9,
                                discountApplied = true
                            )
                        )
                    } else {
                        NodeOutcome.Continue(context)
                    }
                },
                "finalize" to Node<OrderContext> { context -> NodeOutcome.Stop(context) }
            ),
            continueTo = mapOf(
                "validateTotal" to "discount",
                "discount" to "finalize"
            )
        )

        val invalid = WorkflowEngine(workflow).execute(OrderContext(total = 0.0))
        val invalidCompleted = assertIs<ExecutionResult.Completed<OrderContext>>(invalid)
        assertEquals(0.0, invalidCompleted.context.total)
        assertFalse(invalidCompleted.context.discountApplied)
        assertEquals(listOf("ORD-001"), invalidCompleted.violations.map { it.code })

        val discounted = WorkflowEngine(workflow).execute(OrderContext(total = 200.0))
        val discountedCompleted = assertIs<ExecutionResult.Completed<OrderContext>>(discounted)
        assertEquals(180.0, discountedCompleted.context.total)
        assertTrue(discountedCompleted.context.discountApplied)
        assertTrue(discountedCompleted.violations.isEmpty())
    }

    @Test
    fun mixedRoutingAndAccumulation_fluentBuilderWithInlineLambdas_andFailFastStops() {
        val workflow = WorkflowBuilder<OrderContext>().apply {
            start("validateTotal")

            node("validateTotal") { ctx ->
                if (ctx.total <= 0) {
                    NodeOutcome.Continue(
                        ctx,
                        listOf(Violation("ORD-001", "Total must be positive"))
                    )
                } else {
                    NodeOutcome.Continue(ctx)
                }
            }

            node("discount") { ctx ->
                if (ctx.total > 100) {
                    NodeOutcome.Continue(
                        ctx.copy(
                            total = ctx.total * 0.9,
                            discountApplied = true
                        )
                    )
                } else {
                    NodeOutcome.Continue(ctx)
                }
            }

            node("finalize") { ctx ->
                NodeOutcome.Stop(ctx)
            }

            edge("validateTotal", "discount")
            edge("discount", "finalize")
        }.build()

        val accumulateResult = WorkflowEngine(workflow).execute(OrderContext(total = -1.0))
        val accumulateCompleted = assertIs<ExecutionResult.Completed<OrderContext>>(accumulateResult)
        assertEquals(1, accumulateCompleted.violations.size)

        val failFastResult = WorkflowEngine(
            workflow,
            EngineConfig(failFastOnError = true)
        ).execute(OrderContext(total = -1.0))

        val validationFailed = assertIs<ExecutionResult.ValidationFailed<OrderContext>>(failFastResult)
        assertEquals(listOf("ORD-001"), validationFailed.violations.map { it.code })
    }
}

private data class IntContext(val value: Int)
private data class UserContext(val age: Int)

private data class OrderContext(
    val total: Double,
    val discountApplied: Boolean = false
)

private class WorkflowBuilder<C> {
    private var startNodeId: String? = null
    private val nodes = mutableMapOf<String, Node<C>>()
    private val continueTo = mutableMapOf<String, String>()

    fun start(id: String) {
        startNodeId = id
    }

    fun node(id: String, block: (C) -> NodeOutcome<C>) {
        nodes[id] = Node { context -> block(context) }
    }

    fun edge(from: String, to: String) {
        continueTo[from] = to
    }

    fun build(): Workflow<C> {
        return Workflow(
            startNodeId = requireNotNull(startNodeId),
            nodes = nodes,
            continueTo = continueTo
        )
    }
}
