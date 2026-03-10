package biz.digitalindustry.workflow.dsltoml

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TomlWorkflowCodecRoundTripTest {

    private val codec: TomlWorkflowCodec = DefaultTomlWorkflowCodec()

    @Test
    fun `decode canonical workflow example`() {
        val source = loadCanonicalExample()

        val workflow = codec.decode(source)

        assertEquals("validate", workflow.startNode)
        assertTrue(workflow.nodes.containsKey("validate"))
        assertTrue(workflow.nodes.containsKey("finalize"))
        assertEquals("standard", workflow.continueRoutes["validate"])
        assertEquals("highRisk", workflow.routing["validate"]?.get("highRisk")?.to)
    }

    @Test
    fun `round trip canonical workflow example`() {
        val source = loadCanonicalExample()

        val decoded = codec.decode(source)
        val encoded = codec.encode(decoded)
        val decodedAgain = codec.decode(encoded)

        assertEquals(decoded, decodedAgain)
    }

    private fun loadCanonicalExample(): String {
        val candidates = listOf(
            Path.of("examples", "workflows", "canonical-workflow.toml"),
            Path.of("..", "examples", "workflows", "canonical-workflow.toml")
        )

        val existing = candidates.firstOrNull { Files.exists(it) }
            ?: error("Could not locate examples/workflows/canonical-workflow.toml")

        return Files.readString(existing)
    }
}
