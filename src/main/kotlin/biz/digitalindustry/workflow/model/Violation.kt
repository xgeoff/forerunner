package biz.digitalindustry.workflow.model

data class Violation(
    val code: String,
    val message: String,
    val severity: Severity = Severity.ERROR
) {
    constructor(code: String, message: String) :
        this(code, message, Severity.ERROR)

    companion object {

        @JvmStatic
        fun error(code: String, message: String): Violation =
            Violation(code, message, Severity.ERROR)

        @JvmStatic
        fun warning(code: String, message: String): Violation =
            Violation(code, message, Severity.WARNING)
    }
}
