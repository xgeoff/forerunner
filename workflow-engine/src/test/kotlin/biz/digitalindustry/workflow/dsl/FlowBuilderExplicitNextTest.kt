package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class FlowBuilderExplicitNextTest {

    private data class Ctx(val value: Int)

    @Test
    fun nextDefinesDefaultEdgeAndExecutes() {
        val flow = FlowBuilder.start<Ctx>("start")
            .node("start") { ctx -> NodeOutcome.Continue(ctx.copy(value = ctx.value + 1)) }
            .next("end")
            .node("end") { ctx -> NodeOutcome.Stop(ctx.copy(value = ctx.value * 10)) }
            .build()

        val result = WorkflowEngine(flow).execute(Ctx(2))

        val completed = assertIs<ExecutionResult.Completed<Ctx>>(result)
        assertEquals(30, completed.context.value)
    }
}
