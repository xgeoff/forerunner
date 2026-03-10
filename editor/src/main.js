import {
  addNode,
  clearSelection,
  connectNodes,
  deleteEdge,
  deleteSelected,
  edges,
  getSelectedEdge,
  getSelectedNode,
  moveNode,
  nextNodeId,
  nodes,
  pendingConnectionFrom,
  renameNode,
  selectEdge,
  selectNode,
  setNodeField,
  setNodeType,
  setStartNode,
  startConnection,
  updateEdge,
  workflowStartNodeId
} from "./graph-store.js"
import { exportWorkflow } from "./toml-export.js"
import { computeLayout } from "./layout.js"
import "skeleton-css/css/normalize.css"
import "skeleton-css/css/skeleton.css"

const NODE_WIDTH = 220
const NODE_HEIGHT = 60
const SCENE_WIDTH = 1200
const SCENE_HEIGHT = 980
const MIN_SCALE = 0.45
const MAX_SCALE = 1.8
const SAMPLE_NODES = [
  ["underwrite", "task"],
  ["riskCheck", "task"],
  ["eligibilityCheck", "task"],
  ["fraudCheck", "task"],
  ["creditCheck", "task"],
  ["ageCheck", "task"],
  ["price", "task"],
  ["highRiskSurcharge", "task"],
  ["loyaltyDiscount", "task"],
  ["issue", "end"]
]
const SAMPLE_EDGES = [
  ["underwrite", "riskCheck", "route", "requiresRiskReview"],
  ["underwrite", "eligibilityCheck", "continue", null],
  ["riskCheck", "fraudCheck", "continue", null],
  ["fraudCheck", "creditCheck", "continue", null],
  ["creditCheck", "price", "continue", null],
  ["eligibilityCheck", "ageCheck", "continue", null],
  ["ageCheck", "price", "continue", null],
  ["price", "highRiskSurcharge", "route", "highRisk"],
  ["price", "loyaltyDiscount", "route", "loyalCustomer"],
  ["price", "issue", "continue", null],
  ["highRiskSurcharge", "issue", "continue", null],
  ["loyaltyDiscount", "issue", "continue", null]
]
const NODE_META = {
  underwrite: { handler: "tenant.underwriting.evaluate" },
  riskCheck: { handler: "tenant.risk.evaluate" },
  eligibilityCheck: { handler: "tenant.eligibility.evaluate" },
  fraudCheck: { handler: "tenant.risk.fraudCheck" },
  creditCheck: { handler: "tenant.risk.creditCheck" },
  ageCheck: { handler: "tenant.eligibility.ageCheck" },
  price: { handler: "tenant.pricing.evaluate" },
  highRiskSurcharge: { handler: "tenant.pricing.highRiskSurcharge" },
  loyaltyDiscount: { handler: "tenant.pricing.loyaltyDiscount" },
  issue: { status: "ISSUED" }
}

const app = document.querySelector("#app")
let dragState = null
let panState = null
let copied = false
let viewport = { x: 0, y: 0, scale: 1 }
let pointerWorld = null
let tomlDraft = ""
let tomlError = ""
let tomlDirty = false
let edgeInspectorState = { edgeId: null, target: "", targetMenuOpen: false }

startApp()

function startApp() {
  try {
    bootstrap()
    render()
  } catch (error) {
    renderError(error)
  }
}

function requestRender() {
  try {
    render()
  } catch (error) {
    renderError(error)
  }
}

function renderError(error) {
  if (!app) return
  const message = error instanceof Error ? error.message : String(error)
  app.innerHTML = `
    <div class="fatal-screen">
      <div class="fatal-card">
        <h2>Editor failed to render</h2>
        <p>${escapeHtml(message)}</p>
        <button id="reload-btn" class="button button-primary">Reload</button>
      </div>
    </div>
  `
  const reloadBtn = document.querySelector("#reload-btn")
  if (reloadBtn) reloadBtn.addEventListener("click", () => window.location.reload())
  console.error("Editor render error", error)
}

function bootstrap() {
  if (Object.keys(nodes.get()).length === 0) {
    SAMPLE_NODES.forEach(([id, type]) => {
      addNode(id, 0, 0, type)
    })

    SAMPLE_EDGES.forEach(([from, to, type, route]) => {
      connectNodes(from, to, type, route)
    })

    setStartNode("underwrite")
    applyAutoLayout()
    fitViewport()
  }

  window.addEventListener("mousemove", onMouseMove)
  window.addEventListener("mouseup", stopDrag)
  window.addEventListener("keydown", onKeyDown)
}

function render() {
  if (!app) return

  const selectedNode = getSelectedNode()
  const selectedEdge = getSelectedEdge()
  const pendingFrom = pendingConnectionFrom.get()
  const startNode = workflowStartNodeId.get() ?? inferStartNode()
  const toml = exportWorkflow(startNode)
  if (!tomlDirty) {
    tomlDraft = toml
  }

  app.innerHTML = `
    <div class="app-shell dark">
      <header class="topbar">
        <div class="brand-left">
          <div class="brand-icon">WF</div>
          <div class="brand-copy">
            <h1>FlowForge</h1>
            <p>Visual DSL Editor</p>
          </div>
        </div>
        <div class="status-pill">
          <span class="status-star">+</span>
          Auto-generating TOML configuration
        </div>
      </header>

      <main class="main-split">
        <section class="editor-stage">
          <div id="canvas" class="canvas" tabindex="0">
            ${renderCanvasChrome()}
            ${renderPalette()}
            ${renderInspector(selectedNode)}
            ${renderEdgeInspector(selectedEdge)}
            <div
              id="scene"
              class="scene"
              style="width:${SCENE_WIDTH}px;height:${SCENE_HEIGHT}px;transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale});"
            >
              ${renderEdges()}
              ${renderNodes()}
            </div>
            ${renderCanvasFooter(selectedNode, selectedEdge, pendingFrom)}
          </div>
        </section>

        <div class="split-handle">
          <span></span>
        </div>

        <aside class="toml-stage">
          <div class="toml-panel">
            <div class="toml-header">
              <div class="toml-title">
                <span class="toml-icon">{ }</span>
                <strong>Workflow TOML</strong>
              </div>
              <div class="toml-actions">
                <button class="button secondary-button" data-action="apply-toml">Apply</button>
                <button class="button ghost-button" data-action="copy-toml">${copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            ${tomlError ? `<div class="toml-error">${escapeHtml(tomlError)}</div>` : ""}
            <textarea id="toml-editor" class="toml-editor" spellcheck="false">${escapeHtml(tomlDraft)}</textarea>
          </div>
        </aside>
      </main>
    </div>
  `

  bindEvents()
}

function renderCanvasChrome() {
  return `
    <div class="canvas-actions">
      <button class="button secondary-button" data-action="layout">Auto Layout</button>
      <button class="button button-primary" data-action="add-node">+</button>
    </div>

    <div class="canvas-panel canvas-panel-top-right">
      <button class="flow-control-button" data-action="zoom-in">+</button>
      <button class="flow-control-button" data-action="zoom-out">-</button>
      <button class="flow-control-button" data-action="zoom-fit">o</button>
    </div>

    <div class="zoom-controls">
      <button class="zoom-button" data-action="zoom-in">+</button>
      <button class="zoom-button" data-action="zoom-out">-</button>
      <button class="zoom-button" data-action="zoom-fit">[]</button>
    </div>

    ${renderMiniMap()}
  `
}

function renderPalette() {
  return `
    <div class="node-palette">
      <div class="palette-title">Palette</div>
      <div class="palette-item" draggable="true" data-palette-item="node">
        <span class="palette-icon">+</span>
        <span>Node</span>
      </div>
    </div>
  `
}

function renderCanvasFooter(selectedNode, selectedEdge, pendingFrom) {
  if (selectedNode) {
    const isStart = workflowStartNodeId.get() === selectedNode.id
    const kind = isStart ? "start" : (selectedNode.type || "task")
    return `
      <div class="selection-bar">
        <span class="selection-label">Selected node</span>
        <strong>${selectedNode.id}</strong>
        <span class="selection-detail">${kind}</span>
      </div>
    `
  }

  if (selectedEdge) {
    const label = selectedEdge.type === "route" ? selectedEdge.route : "default"
    return `
      <div class="selection-bar">
        <span class="selection-label">Selected edge</span>
        <strong>${selectedEdge.from} -> ${selectedEdge.to}</strong>
        <span class="selection-detail">${label}</span>
      </div>
    `
  }

  if (pendingFrom) {
    return `
      <div class="selection-bar">
        <span class="selection-label">Connecting from</span>
        <strong>${pendingFrom}</strong>
        <span class="selection-detail">Drop on a node or empty canvas</span>
      </div>
    `
  }

  return `
    <div class="selection-bar muted-bar">
      <span class="selection-label">Workflow</span>
      <strong>Underwriting Flow</strong>
      <span class="selection-detail">Drag nodes or inspect the generated TOML</span>
    </div>
  `
}

function renderInspector(node) {
  if (!node) return ""

  const isStart = workflowStartNodeId.get() === node.id
  const isEnd = node.type === "end"
  const handler = node.handler ?? ""

  return `
    <div class="node-inspector">
      <div class="inspector-title">Node</div>
      <label class="inspector-field">
        <span>ID</span>
        <input id="node-id-input" type="text" value="${node.id}" />
      </label>
      <label class="inspector-field">
        <span>Handler</span>
        <input id="node-handler-input" type="text" value="${handler}" placeholder="tenant.workflow.step" />
      </label>
      <label class="inspector-toggle">
        <input id="node-start-input" type="checkbox" ${isStart ? "checked" : ""} />
        <span>Start node</span>
      </label>
      <label class="inspector-toggle">
        <input id="node-end-input" type="checkbox" ${isEnd ? "checked" : ""} />
        <span>End node</span>
      </label>
      <div class="inspector-actions">
        <button class="button secondary-button" id="rename-node-btn">Apply</button>
        <button class="button ghost-button" id="delete-node-btn">Delete</button>
      </div>
    </div>
  `
}

function renderEdgeInspector(edge) {
  if (!edge) return ""

  if (edgeInspectorState.edgeId !== edge.id) {
    edgeInspectorState = {
      edgeId: edge.id,
      target: edge.to,
      targetMenuOpen: false
    }
  }

  const targetOptions = Object.keys(nodes.get())
    .filter((id) => id !== edge.from)
    .sort()
    .map((id) => `
      <button class="edge-target-option" data-edge-target="${id}">
        ${id}
      </button>
    `)
    .join("")

  return `
    <div class="edge-inspector">
      <div class="inspector-title">Edge</div>
      <div class="inspector-readonly">${edge.from} -> ${edge.to}</div>
      <label class="inspector-field">
        <span>Target</span>
        <button class="edge-target-trigger" id="edge-target-trigger" type="button">
          <span>${edgeInspectorState.target}</span>
          <span class="edge-target-caret">v</span>
        </button>
        ${edgeInspectorState.targetMenuOpen ? `
          <div class="edge-target-menu">
            ${targetOptions}
          </div>
        ` : ""}
      </label>
      <label class="inspector-field">
        <span>Type</span>
        <div class="inspector-static">${edge.type}</div>
      </label>
      ${edge.type === "route" ? `
        <label class="inspector-field">
          <span>Route name</span>
          <input id="edge-route-input" type="text" value="${edge.route ?? ""}" />
        </label>
      ` : ""}
      <div class="inspector-actions">
        <button class="button secondary-button" id="apply-edge-btn">Apply</button>
        <button class="button ghost-button" id="delete-edge-btn">Delete</button>
      </div>
    </div>
  `
}

function renderNodes() {
  const selectedId = getSelectedNode()?.id
  const pendingId = pendingConnectionFrom.get()

  return Object.values(nodes.get())
    .map((node) => {
      const meta = NODE_META[node.id] ?? {}
      const isStart = workflowStartNodeId.get() === node.id
      const classes = ["node-card", `node-${node.type || "task"}`]
      if (isStart) classes.push("node-start")
      if (selectedId === node.id) classes.push("selected")
      if (pendingId === node.id) classes.push("pending")

      const icon = nodeIcon(node.id, node.type)
      const handler = node.handler ?? meta.handler
      const subline = meta.status ?? handler?.split(".").pop() ?? (isStart ? "start" : (node.type || "task"))

      return `
        <div class="${classes.join(" ")}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px;width:${NODE_WIDTH}px;height:${NODE_HEIGHT}px">
          <span class="node-handle node-handle-in"></span>
          <div class="node-icon">${icon}</div>
          <div class="node-content">
            <div class="node-title">${titleize(node.id)}</div>
            <div class="node-meta">${subline}</div>
          </div>
          ${node.type === "end" ? "" : `<span class="node-handle node-handle-out" data-handle-out="${node.id}"></span>`}
        </div>
      `
    })
    .join("\n")
}

function renderEdges() {
  const selectedId = getSelectedEdge()?.id
  const pendingMarkup = renderPendingEdge()

  const markup = edges.get().map((edge) => {
    const from = nodes.get()[edge.from]
    const to = nodes.get()[edge.to]
    if (!from || !to) return ""

    const x1Base = from.x + NODE_WIDTH / 2
    const y1 = from.y + NODE_HEIGHT
    const x2Base = to.x + NODE_WIDTH / 2
    const y2 = to.y
    const outgoingOffset = edgeFanOffset(edge, x1Base, x2Base)
    const x1 = x1Base + outgoingOffset
    const x2 = x2Base
    const dy = Math.max(42, Math.abs(y2 - y1) * 0.48)
    const d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2 - (edge.type === "route" ? 6 : 0)
    const labelMarkup = edge.type === "route"
      ? `
        <foreignObject x="${mx - 48}" y="${my - 11}" width="96" height="22">
          <div class="edge-label route-label">${edge.route}</div>
        </foreignObject>
      `
      : ""

    return `
      <g class="edge ${edge.id === selectedId ? "selected" : ""}" data-edge-id="${edge.id}">
        <path d="${d}" marker-end="url(#arrowhead)" />
        ${labelMarkup}
      </g>
    `
  }).join("\n")

  return `
    <svg class="edge-layer" width="100%" height="100%" viewBox="0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}" preserveAspectRatio="none">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="5.7" refY="2.6" orient="auto">
          <polygon points="0 0, 5.7 2.6, 0 5.2" class="edge-arrow"></polygon>
        </marker>
      </defs>
      ${markup}
      ${pendingMarkup}
    </svg>
  `
}

function edgeFanOffset(edge, sourceX, targetX) {
  const siblings = edges.get().filter((candidate) => candidate.from === edge.from)
  if (siblings.length <= 1) return 0

  if (edge.type === "continue") return 0

  const direction = targetX < sourceX ? -1 : 1
  const routesBefore = siblings
    .filter((candidate) => candidate.type === "route")
    .findIndex((candidate) => candidate.id === edge.id)

  const step = 20
  return direction * step * (routesBefore + 1)
}

function renderPendingEdge() {
  const fromId = pendingConnectionFrom.get()
  if (!fromId || !pointerWorld) return ""

  const from = nodes.get()[fromId]
  if (!from) return ""

  const x1 = from.x + NODE_WIDTH / 2
  const y1 = from.y + NODE_HEIGHT
  const x2 = pointerWorld.x
  const y2 = pointerWorld.y
  const dy = Math.max(42, Math.abs(y2 - y1) * 0.48)
  const d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`

  return `
    <g class="edge edge-pending">
      <path d="${d}" marker-end="url(#arrowhead)" />
    </g>
  `
}

function renderMiniMap() {
  const bounds = getGraphBounds()
  const mapWidth = 164
  const mapHeight = 108
  const innerPadding = 10
  const usableWidth = mapWidth - innerPadding * 2
  const usableHeight = mapHeight - innerPadding * 2
  const scale = Math.min(
    usableWidth / Math.max(bounds.width, 1),
    usableHeight / Math.max(bounds.height, 1)
  )
  const contentWidth = bounds.width * scale
  const contentHeight = bounds.height * scale
  const offsetX = innerPadding + (usableWidth - contentWidth) / 2
  const offsetY = innerPadding + (usableHeight - contentHeight) / 2

  const nodeMarkup = Object.values(nodes.get()).map((node) => {
    const x = offsetX + (node.x - bounds.minX) * scale
    const y = offsetY + (node.y - bounds.minY) * scale
    const width = Math.max(10, NODE_WIDTH * scale)
    const height = Math.max(6, NODE_HEIGHT * scale)
    return `<span class="mini-node" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></span>`
  }).join("")

  const viewportRect = computeMiniViewport(bounds, scale, offsetX, offsetY)

  return `
    <div class="mini-map">
      ${nodeMarkup}
      <div
        class="mini-map-viewport"
        style="left:${viewportRect.x}px;top:${viewportRect.y}px;width:${viewportRect.width}px;height:${viewportRect.height}px"
      ></div>
    </div>
  `
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => onAction(el.dataset.action))
  })

  const tomlEditor = document.querySelector("#toml-editor")
  if (tomlEditor) {
    tomlEditor.addEventListener("input", (event) => {
      tomlDraft = event.target.value
      tomlDirty = true
    })
  }

  const canvas = document.querySelector("#canvas")
  if (canvas) {
    canvas.addEventListener("click", onCanvasClick)
    canvas.addEventListener("mousedown", onCanvasMouseDown)
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false })
    canvas.addEventListener("dragover", onCanvasDragOver)
    canvas.addEventListener("drop", onCanvasDrop)
  }

  document.querySelectorAll("[data-palette-item]").forEach((el) => {
    el.addEventListener("dragstart", onPaletteDragStart)
  })

  document.querySelectorAll("[data-node-id]").forEach((el) => {
    el.addEventListener("mousedown", onNodeMouseDown)
    el.addEventListener("click", onNodeClick)
  })

  document.querySelectorAll("[data-handle-out]").forEach((el) => {
    el.addEventListener("mousedown", onHandleMouseDown)
  })

  document.querySelectorAll("[data-edge-id]").forEach((el) => {
    el.addEventListener("click", onEdgeClick)
  })

  bindInspectorEvents()
  bindEdgeInspectorEvents()
}

function onAction(action) {
  if (action === "add-node") {
    createNodeAtViewportCenter()
    requestRender()
    return
  }

  if (action === "layout") {
    applyAutoLayout()
    fitViewport()
    requestRender()
    return
  }

  if (action === "zoom-in") {
    zoomAroundCanvasCenter(1.12)
    requestRender()
    return
  }

  if (action === "zoom-out") {
    zoomAroundCanvasCenter(1 / 1.12)
    requestRender()
    return
  }

  if (action === "zoom-fit") {
    fitViewport()
    requestRender()
    return
  }

  if (action === "copy-toml") {
    const text = tomlDraft || exportWorkflow(inferStartNode())
    navigator.clipboard?.writeText(text).then(() => {
      copied = true
      requestRender()
      setTimeout(() => {
        copied = false
        requestRender()
      }, 1200)
    }).catch(() => {
      window.alert("Clipboard unavailable")
    })
  }

  if (action === "apply-toml") {
    applyTomlDraft()
    return
  }
}

function bindInspectorEvents() {
  const selectedNode = getSelectedNode()
  if (!selectedNode) return

  const applyBtn = document.querySelector("#rename-node-btn")
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const idInput = document.querySelector("#node-id-input")
      const handlerInput = document.querySelector("#node-handler-input")
      const startInput = document.querySelector("#node-start-input")
      const endInput = document.querySelector("#node-end-input")
      if (!idInput || !handlerInput || !startInput || !endInput) return

      const nextId = idInput.value.trim()
      try {
        if (nextId && nextId !== selectedNode.id) {
          renameNode(selectedNode.id, nextId)
        }
        const resolvedId = nextId || selectedNode.id
        setNodeField(resolvedId, "handler", handlerInput.value.trim())
        setNodeType(resolvedId, endInput.checked ? "end" : "task")
        if (startInput.checked) {
          setStartNode(resolvedId)
        } else if (workflowStartNodeId.get() === resolvedId) {
          setStartNode(Object.keys(nodes.get()).find((id) => id !== resolvedId) ?? resolvedId)
        }
      } catch (err) {
        window.alert(err.message)
      }
      requestRender()
    })
  }

  const deleteBtn = document.querySelector("#delete-node-btn")
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      deleteSelected()
      requestRender()
    })
  }
}

function bindEdgeInspectorEvents() {
  const selectedEdge = getSelectedEdge()
  if (!selectedEdge) return

  const targetTrigger = document.querySelector("#edge-target-trigger")
  if (targetTrigger) {
    targetTrigger.addEventListener("click", () => {
      edgeInspectorState = {
        ...edgeInspectorState,
        targetMenuOpen: !edgeInspectorState.targetMenuOpen
      }
      requestRender()
    })
  }

  document.querySelectorAll("[data-edge-target]").forEach((el) => {
    el.addEventListener("click", () => {
      edgeInspectorState = {
        ...edgeInspectorState,
        target: el.dataset.edgeTarget,
        targetMenuOpen: false
      }
      requestRender()
    })
  })

  const applyBtn = document.querySelector("#apply-edge-btn")
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const routeInput = document.querySelector("#edge-route-input")

      try {
        const updates = {
          to: edgeInspectorState.target || selectedEdge.to
        }
        if (selectedEdge.type === "route" && routeInput) {
          updates.route = routeInput.value.trim()
        }
        updateEdge(selectedEdge.id, updates)
      } catch (err) {
        window.alert(err.message)
      }
      requestRender()
    })
  }

  const deleteBtn = document.querySelector("#delete-edge-btn")
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      edgeInspectorState = { edgeId: null, target: "", targetMenuOpen: false }
      deleteEdge(selectedEdge.id)
      requestRender()
    })
  }
}

function applyAutoLayout() {
  const graph = computeLayout()
  const next = { ...nodes.get() }
  const positioned = []

  Object.keys(next).forEach((id) => {
    const p = graph.node(id)
    if (!p) return
    const positionedNode = {
      ...next[id],
      x: Math.max(24, p.x - NODE_WIDTH / 2),
      y: Math.max(32, p.y - NODE_HEIGHT / 2)
    }
    next[id] = positionedNode
    positioned.push(positionedNode)
  })

  if (positioned.length > 0) {
    const minX = Math.min(...positioned.map((node) => node.x))
    const maxX = Math.max(...positioned.map((node) => node.x + NODE_WIDTH))
    const contentWidth = maxX - minX
    const targetWidth = 1160
    const shiftX = Math.max(0, (targetWidth - contentWidth) / 2 - minX)

    Object.keys(next).forEach((id) => {
      next[id] = {
        ...next[id],
        x: next[id].x + shiftX
      }
    })
  }

  nodes.set(next)
}

function fitViewport() {
  const canvas = document.querySelector("#canvas")
  if (!canvas) return

  const bounds = getGraphBounds()
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const horizontalPadding = 120
  const topPadding = 92
  const bottomPadding = 220
  const scale = clamp(
    Math.min(
      width / Math.max(bounds.width + horizontalPadding * 2, 1),
      height / Math.max(bounds.height + topPadding + bottomPadding, 1),
      1
    ),
    MIN_SCALE,
    MAX_SCALE
  )

  viewport = {
    scale,
    x: (width - bounds.width * scale) / 2 - bounds.minX * scale,
    y: topPadding - bounds.minY * scale
  }
  clampViewport()
}

function zoomAroundCanvasCenter(factor) {
  const canvas = document.querySelector("#canvas")
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
}

function zoomAtClientPoint(clientX, clientY, factor) {
  const canvas = document.querySelector("#canvas")
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const nextScale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE)
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  const worldX = (localX - viewport.x) / viewport.scale
  const worldY = (localY - viewport.y) / viewport.scale

  viewport = {
    scale: nextScale,
    x: localX - worldX * nextScale,
    y: localY - worldY * nextScale
  }
  clampViewport()
}

function clientToWorld(clientX, clientY) {
  const canvas = document.querySelector("#canvas")
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }

  return {
    x: (clientX - rect.left - viewport.x) / viewport.scale,
    y: (clientY - rect.top - viewport.y) / viewport.scale
  }
}

function getGraphBounds() {
  const values = Object.values(nodes.get())
  if (values.length === 0) {
    return { minX: 0, minY: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT }
  }

  const minX = Math.min(...values.map((node) => node.x))
  const minY = Math.min(...values.map((node) => node.y))
  const maxX = Math.max(...values.map((node) => node.x + NODE_WIDTH))
  const maxY = Math.max(...values.map((node) => node.y + NODE_HEIGHT))

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isCanvasBackgroundTarget(target) {
  if (!(target instanceof Element)) return false
  return target.id === "canvas" || target.id === "scene"
}

function clampViewport() {
  const canvas = document.querySelector("#canvas")
  if (!canvas) return

  const bounds = getGraphBounds()
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const scaledWidth = bounds.width * viewport.scale
  const scaledHeight = bounds.height * viewport.scale
  const horizontalSlack = Math.max(160, width * 0.18)
  const verticalSlack = Math.max(320, height * 0.45)
  const minX = width - (bounds.minX * viewport.scale + scaledWidth) - horizontalSlack
  const maxX = horizontalSlack - bounds.minX * viewport.scale
  const minY = height - (bounds.minY * viewport.scale + scaledHeight) - verticalSlack
  const maxY = verticalSlack - bounds.minY * viewport.scale

  viewport = {
    ...viewport,
    x: clamp(viewport.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(viewport.y, Math.min(minY, maxY), Math.max(minY, maxY))
  }
}

function computeMiniViewport(bounds, miniScale, offsetX, offsetY) {
  const canvas = document.querySelector("#canvas")
  if (!canvas) {
    return { x: offsetX, y: offsetY, width: 40, height: 24 }
  }

  const viewLeft = (-viewport.x / viewport.scale - bounds.minX) * miniScale + offsetX
  const viewTop = (-viewport.y / viewport.scale - bounds.minY) * miniScale + offsetY
  const viewWidth = (canvas.clientWidth / viewport.scale) * miniScale
  const viewHeight = (canvas.clientHeight / viewport.scale) * miniScale

  return {
    x: viewLeft,
    y: viewTop,
    width: Math.max(24, viewWidth),
    height: Math.max(18, viewHeight)
  }
}

function onCanvasClick(event) {
  if (!isCanvasBackgroundTarget(event.target)) return
  focusCanvas()
  clearSelection()
  requestRender()
}

function onCanvasMouseDown(event) {
  if (!isCanvasBackgroundTarget(event.target)) return
  focusCanvas()
  if (pendingConnectionFrom.get()) return

  panState = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: viewport.x,
    startY: viewport.y
  }
}

function onNodeClick(event) {
  event.stopPropagation()
  focusCanvas()
  const nodeId = event.currentTarget.dataset.nodeId

  selectNode(nodeId)
  requestRender()
}

function onEdgeClick(event) {
  event.stopPropagation()
  focusCanvas()
  selectEdge(event.currentTarget.dataset.edgeId)
  requestRender()
}

function onNodeMouseDown(event) {
  focusCanvas()
  if (event.target instanceof Element && event.target.closest("[data-handle-out]")) return

  const nodeId = event.currentTarget.dataset.nodeId
  const node = nodes.get()[nodeId]
  const point = clientToWorld(event.clientX, event.clientY)
  if (!node) return

  dragState = {
    nodeId,
    dx: point.x - node.x,
    dy: point.y - node.y
  }

  selectNode(nodeId)
  requestRender()
}

function onHandleMouseDown(event) {
  event.stopPropagation()
  focusCanvas()
  const sourceId = event.currentTarget.dataset.handleOut
  if (!sourceId) return
  startConnection(sourceId)
  pointerWorld = clientToWorld(event.clientX, event.clientY)
  requestRender()
}

function onMouseMove(event) {
  if (dragState) {
    const point = clientToWorld(event.clientX, event.clientY)
    const x = point.x - dragState.dx
    const y = point.y - dragState.dy
    moveNode(dragState.nodeId, Math.max(8, x), Math.max(8, y))
    requestRender()
    return
  }

  if (panState) {
    viewport = {
      ...viewport,
      x: panState.startX + (event.clientX - panState.startClientX),
      y: panState.startY + (event.clientY - panState.startClientY)
    }
    clampViewport()
    requestRender()
    return
  }

  if (pendingConnectionFrom.get()) {
    pointerWorld = clientToWorld(event.clientX, event.clientY)
    requestRender()
  }
}

function stopDrag(event) {
  dragState = null
  panState = null

  if (!pendingConnectionFrom.get()) return

  const sourceId = pendingConnectionFrom.get()
  const target = event?.target instanceof Element ? event.target : document.elementFromPoint(event?.clientX ?? 0, event?.clientY ?? 0)
  const nodeTarget = target instanceof Element ? target.closest("[data-node-id]") : null

  try {
    if (nodeTarget) {
      const targetId = nodeTarget.dataset.nodeId
      if (targetId && targetId !== sourceId) {
        createConnectionFrom(sourceId, targetId)
      }
    } else if (target instanceof Element && isCanvasBackgroundTarget(target)) {
      const point = clientToWorld(event.clientX, event.clientY)
      const createdId = createNodeAt(point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2)
      createConnectionFrom(sourceId, createdId)
    }
  } catch (err) {
    window.alert(err.message)
  }

  startConnection(null)
  pointerWorld = null
  requestRender()
}

function onKeyDown(event) {
  if (document.activeElement?.id !== "canvas") return

  if (event.key.toLowerCase() === "a") {
    createNodeAtViewportCenter()
    requestRender()
    return
  }

  if (event.key === "Escape") {
    startConnection(null)
    pointerWorld = null
    clearSelection()
    requestRender()
    return
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelected()
    requestRender()
  }
}

function onCanvasWheel(event) {
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08
  zoomAtClientPoint(event.clientX, event.clientY, factor)
  requestRender()
}

function inferStartNode() {
  if (workflowStartNodeId.get()) return workflowStartNodeId.get()
  const map = nodes.get()
  const ids = Object.keys(map)
  if (ids.length === 0) return "start"

  const inbound = new Map(ids.map((id) => [id, 0]))
  edges.get().forEach((e) => inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1))

  const noIncoming = ids.find((id) => (inbound.get(id) ?? 0) === 0)
  return noIncoming ?? ids[0]
}

function nodeIcon(id, type) {
  if (workflowStartNodeId.get() === id) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
        <path d="M10 8.8L16 12L10 15.2Z" fill="currentColor"></path>
      </svg>
    `
  }

  if (id === "issue" || type === "end") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
        <path d="M8.7 12.3l2.3 2.3 4.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
      <path d="M9 12h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M13.2 9.8L15.7 12l-2.5 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `
}

function createNodeAtViewportCenter() {
  const center = viewportCenterWorld()
  createNodeAt(center.x - NODE_WIDTH / 2, center.y - NODE_HEIGHT / 2)
}

function createNodeAt(x, y) {
  const id = nextNodeId()
  addNode(id, x, y, "task")
  if (!workflowStartNodeId.get()) {
    setStartNode(id)
  }
  selectNode(id)
  return id
}

function focusCanvas() {
  document.querySelector("#canvas")?.focus()
}

function viewportCenterWorld() {
  const canvas = document.querySelector("#canvas")
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }
  return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function onPaletteDragStart(event) {
  event.dataTransfer?.setData("text/plain", "node")
  event.dataTransfer.effectAllowed = "copy"
}

function onCanvasDragOver(event) {
  if (event.dataTransfer?.types.includes("text/plain")) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }
}

function onCanvasDrop(event) {
  const payload = event.dataTransfer?.getData("text/plain")
  if (payload !== "node") return
  event.preventDefault()
  const point = clientToWorld(event.clientX, event.clientY)
  createNodeAt(point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2)
  requestRender()
}

function createConnectionFrom(sourceId, targetId) {
  const suggestedRoute = suggestRouteName(sourceId, targetId)
  const route = window.prompt("Route name (leave blank for default continue)", "")
  if (route == null) return
  const trimmedRoute = route.trim()
  if (!trimmedRoute) {
    connectNodes(sourceId, targetId, "continue")
    return
  }
  connectNodes(sourceId, targetId, "route", trimmedRoute || suggestedRoute)
}

async function applyTomlDraft() {
  try {
    if (!("global" in globalThis)) {
      globalThis.global = globalThis
    }
    const { loadWorkflow } = await import("./toml-import.js")
    const wf = loadWorkflow(tomlDraft)
    setStartNode(wf.startNode ?? Object.keys(nodes.get())[0] ?? null)
    tomlError = ""
    tomlDirty = false
    applyAutoLayout()
    fitViewport()
  } catch (err) {
    tomlError = err instanceof Error ? err.message : String(err)
  }
  requestRender()
}

function suggestRouteName(sourceId, targetId) {
  const targetName = targetId.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/-/g, "_")
  const normalized = targetName.toUpperCase()
  if (normalized === sourceId.toUpperCase()) {
    return "branch"
  }
  return normalized
}

function titleize(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase())
}

function highlightToml(code) {
  return escapeHtml(code)
    .replace(/^(#.*)$/gm, '<span class="tok-comment">$1</span>')
    .replace(/^([\w.]+)\s*=\s*/gm, '<span class="tok-key">$1</span> = ')
    .replace(/"([^"]*)"/g, '<span class="tok-str">"$1"</span>')
    .replace(/^(\[.*\])$/gm, '<span class="tok-sec">$1</span>')
}

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
