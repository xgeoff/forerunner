package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class FlowBuilderDslSugarTest {

    private data class IntContext(val value: Int)

    @Test
    fun thenOverloadWithNodeBlockWorks() {
        val flow = FlowBuilder.start<IntContext>("addTen")
            .node("addTen") { ctx ->
                NodeOutcome.continueWith(ctx.copy(value = ctx.value + 10))
            }
            .then("multiplyByTwo") { ctx ->
                NodeOutcome.stop(ctx.copy(value = ctx.value * 2))
            }
            .build()

        val result = WorkflowEngine().execute(flow, IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
    }

    @Test
    fun nodeScopeDslSugarWorks() {
        val addTenNode: NodeScope<IntContext>.() -> Unit = {
            continueWith { it.copy(value = it.value + 10) }
        }
        val multiplyNode: NodeScope<IntContext>.() -> Unit = {
            stop { it.copy(value = it.value * 2) }
        }

        val flow = FlowBuilder.start<IntContext>("addTen")
            .node("addTen", addTenNode)
            .then("multiplyByTwo", multiplyNode)
            .build()

        val result = WorkflowEngine().execute(flow, IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
    }
}
