package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class FlowBuilderLinearTest {

    private data class IntContext(val value: Int)

    @Test
    fun linearFlowWithThenProducesExpectedResult() {
        val flow = FlowBuilder.start<IntContext>("addTen")
            .node("addTen") { ctx -> NodeOutcome.Continue(ctx.copy(value = ctx.value + 10)) }
            .then("multiplyByTwo")
            .node("multiplyByTwo") { ctx -> NodeOutcome.Stop(ctx.copy(value = ctx.value * 2)) }
            .build()

        val result = WorkflowEngine().execute(flow, IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
    }
}
