package biz.digitalindustry.workflow.dsltoml

/**
 * Contract for TOML schema encoding/decoding.
 * Implementations in this module must honor SCHEMA.md.
 */
interface TomlWorkflowCodec {
    fun decode(tomlText: String): TomlWorkflowDefinition
    fun encode(definition: TomlWorkflowDefinition): String
}
