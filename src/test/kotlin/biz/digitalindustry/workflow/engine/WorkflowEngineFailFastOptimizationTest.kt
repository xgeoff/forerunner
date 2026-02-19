package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.core.Node
import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.core.Workflow
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class WorkflowEngineFailFastOptimizationTest {

    @Test
    fun failFastStopsOnFirstErrorAndSkipsRemainingNodes() {
        data class Ctx(val visited: MutableList<String> = mutableListOf())

        val flow = Workflow(
            startNode = "first",
            nodes = mapOf(
                "first" to Node<Ctx> { ctx ->
                    ctx.visited.add("first")
                    NodeOutcome.Continue(
                        ctx,
                        violations = listOf(Violation("ERR_1", "error", Severity.ERROR))
                    )
                },
                "second" to Node<Ctx> { ctx ->
                    ctx.visited.add("second")
                    NodeOutcome.Stop(ctx)
                }
            ),
            continueTo = mapOf("first" to "second")
        )

        val result = WorkflowEngine(
            flow,
            EngineConfig(failFastOnError = true)
        ).execute(Ctx())

        val failed = assertIs<ExecutionResult.ValidationFailed<Ctx>>(result)
        assertEquals(listOf("first"), failed.context.visited)
        assertEquals(listOf("ERR_1"), failed.violations.map { it.code })
    }
}
