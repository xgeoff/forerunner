package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import kotlin.test.Test
import kotlin.test.assertFailsWith

class FlowBuilderMissingTargetTest {

    @Test
    fun buildFailsWhenEdgeTargetIsMissing() {
        val builder = FlowBuilder.start<Int>("a")
            .node("a") { value -> NodeOutcome.Continue(value) }
            .then("missing")

        assertFailsWith<IllegalStateException> {
            builder.build()
        }
    }
}
