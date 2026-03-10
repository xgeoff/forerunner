import { nodes, edges } from "./graph-store.js"
import { NodeView } from "./components/node.js"
import { EdgeView } from "./components/edge.js"

export function GraphEditorView() {
  const nodeHtml = Object.values(nodes.get()).map(NodeView).join("\n")
  const edgeHtml = edges.get().map(EdgeView).join("\n")

  return `
    <section>
      <h2>Graph Editor</h2>
      <div class="nodes">${nodeHtml}</div>
      <div class="edges">${edgeHtml}</div>
    </section>
  `
}
