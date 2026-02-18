package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.model.Violation

sealed class ExecutionResult<C> {

    data class Completed<C>(
        val context: C,
        val violations: List<Violation>
    ) : ExecutionResult<C>()

    data class ValidationFailed<C>(
        val context: C,
        val violations: List<Violation>
    ) : ExecutionResult<C>()

    data class Fatal<C>(
        val context: C,
        val error: Throwable,
        val violations: List<Violation>
    ) : ExecutionResult<C>()
}
