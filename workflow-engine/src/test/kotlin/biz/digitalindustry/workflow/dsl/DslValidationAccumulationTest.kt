package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.engine.EngineConfig
import biz.digitalindustry.workflow.engine.ExecutionResult
import biz.digitalindustry.workflow.engine.WorkflowEngine
import biz.digitalindustry.workflow.model.Severity
import biz.digitalindustry.workflow.model.Violation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class DslValidationAccumulationTest {

    private data class ValidationContext(val value: Int)

    @Test
    fun violationsAccumulateInDefaultMode() {
        val flow = workflow<ValidationContext>(start = "first") {
            node("first") { ctx ->
                Continue(
                    ctx,
                    violations = listOf(Violation("V-1", "first violation", Severity.WARNING))
                )
            } then "second" then "end"

            node("second") { ctx ->
                Continue(
                    ctx,
                    violations = listOf(Violation("V-2", "second violation", Severity.ERROR))
                )
            }

            node("end") { ctx ->
                Stop(
                    ctx,
                    violations = listOf(Violation("V-3", "stop violation", Severity.WARNING))
                )
            }
        }

        val result = WorkflowEngine(flow).execute(ValidationContext(1))

        val completed = assertIs<ExecutionResult.Completed<ValidationContext>>(result)
        assertEquals(listOf("V-1", "V-2", "V-3"), completed.violations.map { it.code })
    }

    @Test
    fun failFastStopsOnErrorViolation() {
        val flow = workflow<ValidationContext>(start = "first") {
            node("first") { ctx ->
                Continue(
                    ctx,
                    violations = listOf(Violation("V-1", "first violation", Severity.WARNING))
                )
            } then "second" then "end"

            node("second") { ctx ->
                Continue(
                    ctx,
                    violations = listOf(Violation("V-2", "error violation", Severity.ERROR))
                )
            }

            node("end") { ctx ->
                Stop(
                    ctx,
                    violations = listOf(Violation("V-3", "should not be reached", Severity.WARNING))
                )
            }
        }

        val result = WorkflowEngine(
            workflow = flow,
            config = EngineConfig(failFastOnError = true)
        ).execute(ValidationContext(1))

        val failed = assertIs<ExecutionResult.ValidationFailed<ValidationContext>>(result)
        assertEquals(listOf("V-1", "V-2"), failed.violations.map { it.code })
    }
}
