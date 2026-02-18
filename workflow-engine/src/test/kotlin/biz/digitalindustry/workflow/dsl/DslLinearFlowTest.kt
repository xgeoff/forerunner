package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class DslLinearFlowTest {

    private data class IntContext(val value: Int)

    @Test
    fun linearFlowTransformsValue() {
        val flow = workflow<IntContext>(start = "addTen") {
            node("addTen") { ctx -> Continue(ctx.copy(value = ctx.value + 10)) } then "multiplyByTwo"
            node("multiplyByTwo") { ctx -> Stop(ctx.copy(value = ctx.value * 2)) }
        }

        val result = WorkflowEngine(flow).execute(IntContext(5))

        val completed = assertIs<ExecutionResult.Completed<IntContext>>(result)
        assertEquals(30, completed.context.value)
    }
}
