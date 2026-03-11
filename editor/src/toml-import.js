import parseToml from "@iarna/toml/parse-string"
import { nodes, edges } from "./graph-store.js"

export function loadWorkflow(tomlText) {
  const wf = parseToml(tomlText)

  const nextNodes = Object.fromEntries(
    Object.entries(wf.nodes ?? {}).map(([id, node]) => [
      id,
      {
        id,
        x: 0,
        y: 0,
        type: node.type === "end" ? "end" : "task",
        label: node.label ?? "",
        ...node
      }
    ])
  )
  const nextEdges = []
  let edgeCounter = 1

  Object.entries(wf.continue ?? {}).forEach(([from, to]) => {
    nextEdges.push({ id: `e${edgeCounter++}`, from, to, type: "continue", route: null })
  })

  Object.entries(wf.routing ?? {}).forEach(([from, routes]) => {
    Object.entries(routes).forEach(([routeName, routeDef]) => {
      nextEdges.push({ id: `e${edgeCounter++}`, from, to: routeDef.to, type: "route", route: routeName })
    })
  })

  nodes.set(nextNodes)
  edges.set(nextEdges)

  return wf
}
