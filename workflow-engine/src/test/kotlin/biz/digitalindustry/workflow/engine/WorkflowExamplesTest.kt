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
                "addTen" to AddTenNode(),
                "multiplyByTwo" to MultiplyByTwoNode()
            ),
            defaultEdges = mapOf("addTen" to "multiplyByTwo")
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
            node(AddTenNode())
            node(MultiplyByTwoNode())
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
            nodes = mapOf("validateAge" to AgeValidationNode())
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
        val validateAge = object : Node<UserContext> {
            override val id: String = "validateAge"

            override fun execute(context: UserContext): NodeOutcome<UserContext> {
                return if (context.age < 18) {
                    NodeOutcome.Stop(
                        context,
                        violations = listOf(Violation("AGE-001", "User must be at least 18"))
                    )
                } else {
                    NodeOutcome.Stop(context)
                }
            }
        }

        val workflow = WorkflowBuilder<UserContext>().apply {
            start("validateAge")
            node(validateAge)
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
                "validateTotal" to ValidateTotalNode(),
                "discount" to DiscountNode(),
                "finalize" to FinalizeNode()
            ),
            defaultEdges = mapOf(
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

private class AddTenNode : Node<IntContext> {
    override val id: String = "addTen"

    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Continue(context.copy(value = context.value + 10))
    }
}

private class MultiplyByTwoNode : Node<IntContext> {
    override val id: String = "multiplyByTwo"

    override fun execute(context: IntContext): NodeOutcome<IntContext> {
        return NodeOutcome.Stop(context.copy(value = context.value * 2))
    }
}

private class WorkflowBuilder<C> {
    private var startNodeId: String? = null
    private val nodes = mutableMapOf<String, Node<C>>()
    private val edges = mutableMapOf<String, String>()

    fun start(id: String) {
        startNodeId = id
    }

    fun node(node: Node<C>) {
        nodes[node.id] = node
    }

    fun edge(from: String, to: String) {
        edges[from] = to
    }

    fun build(): Workflow<C> {
        return Workflow(
            startNodeId = requireNotNull(startNodeId),
            nodes = nodes,
            defaultEdges = edges
        )
    }
}

private fun <C> WorkflowBuilder<C>.node(id: String, block: (C) -> NodeOutcome<C>) {
    node(object : Node<C> {
        override val id: String = id

        override fun execute(context: C): NodeOutcome<C> = block(context)
    })
}

private data class UserContext(val age: Int)

private class AgeValidationNode : Node<UserContext> {
    override val id: String = "validateAge"

    override fun execute(context: UserContext): NodeOutcome<UserContext> {
        return if (context.age < 18) {
            NodeOutcome.Stop(
                context,
                violations = listOf(Violation("AGE-001", "User must be at least 18"))
            )
        } else {
            NodeOutcome.Stop(context)
        }
    }
}

private data class OrderContext(
    val total: Double,
    val discountApplied: Boolean = false
)

private class ValidateTotalNode : Node<OrderContext> {
    override val id: String = "validateTotal"

    override fun execute(context: OrderContext): NodeOutcome<OrderContext> {
        return if (context.total <= 0) {
            NodeOutcome.Continue(
                context,
                violations = listOf(Violation("ORD-001", "Total must be positive", Severity.ERROR))
            )
        } else {
            NodeOutcome.Continue(context)
        }
    }
}

private class DiscountNode : Node<OrderContext> {
    override val id: String = "discount"

    override fun execute(context: OrderContext): NodeOutcome<OrderContext> {
        return if (context.total > 100) {
            NodeOutcome.Continue(
                context.copy(
                    total = context.total * 0.9,
                    discountApplied = true
                )
            )
        } else {
            NodeOutcome.Continue(context)
        }
    }
}

private class FinalizeNode : Node<OrderContext> {
    override val id: String = "finalize"

    override fun execute(context: OrderContext): NodeOutcome<OrderContext> {
        return NodeOutcome.Stop(context)
    }
}
