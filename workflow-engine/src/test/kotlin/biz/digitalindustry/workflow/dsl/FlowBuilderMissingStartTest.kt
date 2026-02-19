package biz.digitalindustry.workflow.dsl

import biz.digitalindustry.workflow.core.NodeOutcome
import kotlin.test.Test
import kotlin.test.assertFailsWith

class FlowBuilderMissingStartTest {

    @Test
    fun buildFailsWhenStartNodeIsMissing() {
        val builder = FlowBuilder.start<Int>("missing")
            .node("a") { value -> NodeOutcome.Stop(value) }

        assertFailsWith<IllegalStateException> {
            builder.build()
        }
    }
}
