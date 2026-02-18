package biz.digitalindustry.workflow.model

data class Violation(
    val code: String,
    val message: String,
    val severity: Severity = Severity.ERROR
)
