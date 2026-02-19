package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import biz.digitalindustry.workflow.engine.EngineConfig
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class FlowBuilderCanonicalScenariosTest {

    @Test
    fun multiBranchValidationGraph() {
        data class RiskContext(
            val score: Int,
            val path: MutableList<String> = mutableListOf()
        )

        val flow = FlowBuilder.start<RiskContext>("validate")
            .node("validate") { ctx ->
                ctx.path.add("validate")
                if (ctx.score > 80) {
                    NodeOutcome.Next(ctx, "highRisk")
                } else {
                    NodeOutcome.Continue(ctx)
                }
            }
            .next("standard")
            .node("highRisk") { ctx ->
                ctx.path.add("highRisk")
                NodeOutcome.Continue(
                    ctx,
                    violations = listOf(
                        Violation(
                            code = "HIGH_RISK",
                            message = "High risk score detected",
                            severity = Severity.WARNING
                        )
                    )
                )
            }
            .then("finalize")
            .node("standard") { ctx ->
                ctx.path.add("standard")
                NodeOutcome.Continue(ctx)
            }
            .then("finalize")
            .node("finalize") { ctx ->
                ctx.path.add("finalize")
                NodeOutcome.Stop(ctx)
            }
            .build()

        val highRiskResult = WorkflowEngine(flow).execute(RiskContext(score = 90))
        val highRiskCompleted = assertIs<ExecutionResult.Completed<RiskContext>>(highRiskResult)
        assertEquals(listOf("validate", "highRisk", "finalize"), highRiskCompleted.context.path)
        assertEquals(1, highRiskCompleted.violations.size)
        assertEquals(Severity.WARNING, highRiskCompleted.violations.single().severity)

        val standardResult = WorkflowEngine(flow).execute(RiskContext(score = 50))
        val standardCompleted = assertIs<ExecutionResult.Completed<RiskContext>>(standardResult)
        assertEquals(listOf("validate", "standard", "finalize"), standardCompleted.context.path)
        assertTrue(standardCompleted.violations.isEmpty())
    }

    @Test
    fun defaultEdgeFallbackGraph() {
        data class ReviewContext(
            val flagged: Boolean,
            val steps: MutableList<String> = mutableListOf()
        )

        val flow = FlowBuilder.start<ReviewContext>("start")
            .node("start") { ctx ->
                ctx.steps.add("start")
                if (ctx.flagged) {
                    NodeOutcome.Next(ctx, "review")
                } else {
                    NodeOutcome.Continue(ctx)
                }
            }
            .next("end")
            .node("review") { ctx ->
                ctx.steps.add("review")
                NodeOutcome.Continue(ctx)
            }
            .then("end")
            .node("end") { ctx ->
                ctx.steps.add("end")
                NodeOutcome.Stop(ctx)
            }
            .build()

        val unflaggedResult = WorkflowEngine(flow).execute(ReviewContext(flagged = false))
        val unflaggedCompleted = assertIs<ExecutionResult.Completed<ReviewContext>>(unflaggedResult)
        assertEquals(listOf("start", "end"), unflaggedCompleted.context.steps)

        val flaggedResult = WorkflowEngine(flow).execute(ReviewContext(flagged = true))
        val flaggedCompleted = assertIs<ExecutionResult.Completed<ReviewContext>>(flaggedResult)
        assertEquals(listOf("start", "review", "end"), flaggedCompleted.context.steps)
    }

    @Test
    fun loopWithMaxStepProtection() {
        data class LoopContext(val counter: Int)

        val flow = FlowBuilder.start<LoopContext>("loop")
            .node("loop") { ctx ->
                NodeOutcome.Continue(ctx.copy(counter = ctx.counter + 1))
            }
            .then("loop")
            .build()

        val engine = WorkflowEngine(
            flow,
            EngineConfig(maxSteps = 5)
        )

        val result = engine.execute(LoopContext(counter = 0))

        val fatal = assertIs<ExecutionResult.Fatal<LoopContext>>(result)
        assertTrue(fatal.error.message.orEmpty().contains("Max steps exceeded"))
    }

    @Test
    fun mixedValidationAndFailFastGraph() {
        data class ValidationContext(
            val steps: MutableList<String> = mutableListOf()
        )

        val flow = FlowBuilder.start<ValidationContext>("step1")
            .node("step1") { ctx ->
                ctx.steps.add("step1")
                NodeOutcome.Continue(
                    ctx,
                    violations = listOf(
                        Violation("WARN_1", "warning", Severity.WARNING)
                    )
                )
            }
            .then("step2")
            .node("step2") { ctx ->
                ctx.steps.add("step2")
                NodeOutcome.Continue(
                    ctx,
                    violations = listOf(
                        Violation("ERR_1", "error", Severity.ERROR)
                    )
                )
            }
            .then("step3")
            .node("step3") { ctx ->
                ctx.steps.add("step3")
                NodeOutcome.Stop(ctx)
            }
            .build()

        val defaultResult = WorkflowEngine(flow).execute(ValidationContext())
        val defaultCompleted = assertIs<ExecutionResult.Completed<ValidationContext>>(defaultResult)
        assertEquals(listOf("step1", "step2", "step3"), defaultCompleted.context.steps)
        assertEquals(listOf("WARN_1", "ERR_1"), defaultCompleted.violations.map { it.code })

        val failFastResult = WorkflowEngine(
            flow,
            EngineConfig(failFastOnError = true)
        ).execute(ValidationContext())

        val validationFailed = assertIs<ExecutionResult.ValidationFailed<ValidationContext>>(failFastResult)
        assertEquals(listOf("step1", "step2"), validationFailed.context.steps)
        assertEquals(listOf("WARN_1", "ERR_1"), validationFailed.violations.map { it.code })
    }
}
