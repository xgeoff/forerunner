package biz.digitalindustry.workflow.engine

import biz.digitalindustry.workflow.model.Violation

sealed class ExecutionResult<C> {
    abstract fun <R> fold(
        onCompleted: (Completed<C>) -> R,
        onValidationFailed: (ValidationFailed<C>) -> R,
        onFatal: (Fatal<C>) -> R
    ): R

    data class Completed<C>(
        val context: C,
        val violations: List<Violation>
    ) : ExecutionResult<C>() {
        override fun <R> fold(
            onCompleted: (Completed<C>) -> R,
            onValidationFailed: (ValidationFailed<C>) -> R,
            onFatal: (Fatal<C>) -> R
        ): R = onCompleted(this)
    }

    data class ValidationFailed<C>(
        val context: C,
        val violations: List<Violation>
    ) : ExecutionResult<C>() {
        override fun <R> fold(
            onCompleted: (Completed<C>) -> R,
            onValidationFailed: (ValidationFailed<C>) -> R,
            onFatal: (Fatal<C>) -> R
        ): R = onValidationFailed(this)
    }

    data class Fatal<C>(
        val context: C,
        val error: Throwable,
        val violations: List<Violation>
    ) : ExecutionResult<C>() {
        override fun <R> fold(
            onCompleted: (Completed<C>) -> R,
            onValidationFailed: (ValidationFailed<C>) -> R,
            onFatal: (Fatal<C>) -> R
        ): R = onFatal(this)
    }
}
