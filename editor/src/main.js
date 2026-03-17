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
import "@xgeoff/skeleton-plus/skeleton-plus.css"

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
const THEME_STORAGE_KEY = "forerunner-editor-theme"
let dragState = null
let panState = null
let copied = false
let viewport = { x: 0, y: 0, scale: 1 }
let pointerWorld = null
let tomlDraft = ""
let tomlError = ""
let tomlDirty = false
let edgeInspectorState = { edgeId: null, target: "", targetMenuOpen: false }
let pendingEdgeDraft = null
let utilityPanel = null
let currentTheme = "midnight"
let surfaceActive = false
let editingLabelNodeId = null
let workflowName = "Underwriting"

startApp()

function startApp() {
  try {
    currentTheme = loadTheme()
    applyTheme(currentTheme)
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
      <div class="fatal-card card card--raised">
        <h2>Editor failed to render</h2>
        <p>${escapeHtml(message)}</p>
        <button id="reload-btn" class="btn btn--primary">Reload</button>
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
      const seed = NODE_META[id]
      if (seed?.handler) {
        setNodeField(id, "handler", seed.handler)
      }
      if (seed?.label) {
        setNodeField(id, "label", seed.label)
      }
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
  const toml = exportWorkflow(startNode, workflowName)
  if (!tomlDirty) {
    tomlDraft = toml
  }

  app.innerHTML = `
    <div class="app-shell theme-${currentTheme}">
      <header class="topbar">
        <div class="brand-left">
          <div class="brand-icon">WF</div>
          <div class="brand-copy">
            <h1>FlowForge</h1>
            <p>Visual DSL Editor</p>
          </div>
        </div>
        <div class="topbar-right">
          <div class="status-pill">
            <span class="status-star">+</span>
            Auto-generating TOML configuration
          </div>
        </div>
      </header>

      <main class="main-split">
        <section class="editor-stage">
          <div id="canvas" class="canvas" tabindex="0">
            ${renderCanvasChrome()}
            ${renderInspector(selectedNode)}
            ${renderPendingEdgeDraftInspector()}
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
          <div class="toml-panel card card--raised">
            <div class="toml-header">
              <div class="toml-title">
                <span class="toml-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5H6.8C5.81 5 5 5.81 5 6.8v2.1c0 .73-.41 1.4-1.06 1.73L3 11l.94.37c.65.33 1.06 1 1.06 1.73v2.1c0 .99.81 1.8 1.8 1.8H8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M16 5h1.2c.99 0 1.8.81 1.8 1.8v2.1c0 .73.41 1.4 1.06 1.73L21 11l-.94.37c-.65.33-1.06 1-1.06 1.73v2.1c0 .99-.81 1.8-1.8 1.8H16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M10 15l4-8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                  </svg>
                </span>
                <strong>Workflow TOML</strong>
              </div>
              <div class="toml-actions">
                <button class="btn btn--secondary" data-action="apply-toml">Apply</button>
                <button class="btn btn--ghost" data-action="copy-toml">${copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            ${tomlError ? `<div class="toml-error alert alert--error">${escapeHtml(tomlError)}</div>` : ""}
            <textarea id="toml-editor" class="toml-editor input" spellcheck="false">${escapeHtml(tomlDraft)}</textarea>
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
      <button class="btn btn--primary add-node-button" data-action="add-node">+ Add Node</button>
    </div>

    <div class="canvas-panel canvas-panel-top-right">
      <button class="flow-control-button" data-action="zoom-in" data-tooltip="Zoom in" aria-label="Zoom in">+</button>
      <button class="flow-control-button" data-action="zoom-out" data-tooltip="Zoom out" aria-label="Zoom out">-</button>
      <button class="flow-control-button flow-control-icon" data-action="zoom-fit" data-tooltip="Center workflow" aria-label="Center workflow">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M20 9V4h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M4 15v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </button>
      <button class="flow-control-button flow-control-icon" data-action="layout" data-tooltip="Auto-arrange" aria-label="Auto-arrange">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="4.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
          <rect x="14.5" y="4.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
          <rect x="9.5" y="14.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
          <path d="M9.5 7h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          <path d="M12 9.5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
        </svg>
      </button>
      <button class="flow-control-button flow-control-icon" data-action="workflow-panel" data-tooltip="Load or save workflow" aria-label="Load or save workflow">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5.5h9l3 3V18.5H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
          <path d="M9 5.5v5h6v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          <rect x="9" y="14" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect>
        </svg>
      </button>
      <button class="flow-control-button flow-control-icon" data-action="settings-panel" data-tooltip="Settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
          <path d="M12 3.8l1 .2.5 1.8 1.7.7 1.5-1 1.4 1.4-1 1.5.7 1.7 1.8.5.2 1-.2 1-1.8.5-.7 1.7 1 1.5-1.4 1.4-1.5-1-1.7.7-.5 1.8-1 .2-1-.2-.5-1.8-1.7-.7-1.5 1-1.4-1.4 1-1.5-.7-1.7-1.8-.5-.2-1 .2-1 1.8-.5.7-1.7-1-1.5 1.4-1.4 1.5 1 1.7-.7.5-1.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"></path>
        </svg>
      </button>
    </div>

    ${renderUtilityPanel()}

    ${renderMiniMap()}
  `
}

function renderUtilityPanel() {
  if (utilityPanel === "workflow") {
    return `
      <div class="utility-panel card card--raised">
        <div class="inspector-head">
          <div class="inspector-head-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5.5h9l3 3V18.5H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
              <path d="M9 5.5v5h6v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
              <rect x="9" y="14" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect>
            </svg>
          </div>
          <div class="inspector-title">Workflow File</div>
        </div>
        <div class="inspector-body">
          <div class="inspector-readonly">${escapeHtml(workflowName || "unnamed")}</div>
          <div class="utility-actions">
            <button class="btn btn--secondary" data-action="load-from-toml">Load from TOML</button>
            <button class="btn btn--secondary" data-action="download-workflow">Download TOML</button>
            <button class="btn btn--ghost" data-action="close-utility-panel">Close</button>
          </div>
        </div>
      </div>
    `
  }

  if (utilityPanel === "settings") {
    return `
      <div class="utility-panel card card--raised">
        <div class="inspector-head">
          <div class="inspector-head-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
              <path d="M12 3.8l1 .2.5 1.8 1.7.7 1.5-1 1.4 1.4-1 1.5.7 1.7 1.8.5.2 1-.2 1-1.8.5-.7 1.7 1 1.5-1.4 1.4-1.5-1-1.7.7-.5 1.8-1 .2-1-.2-.5-1.8-1.7-.7-1.5 1-1.4-1.4 1-1.5-.7-1.7-1.8-.5-.2-1 .2-1 1.8-.5.7-1.7-1-1.5 1.4-1.4 1.5 1 1.7-.7.5-1.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"></path>
            </svg>
          </div>
          <div class="inspector-title">Settings</div>
        </div>
        <div class="inspector-body">
          <label class="inspector-field">
            <span>Theme</span>
            <div class="theme-switch-row" role="group" aria-label="Theme">
              <button class="theme-side-icon ${currentTheme === "light" ? "is-active" : ""}" data-action="theme-light" aria-label="Light theme">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                  <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9M18.5 18.5l-1.9-1.9M7.4 7.4L5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </button>
              <button class="theme-switch ${currentTheme === "midnight" ? "is-midnight" : "is-light"}" data-action="toggle-theme" aria-label="Toggle theme">
                <span class="theme-switch-thumb" aria-hidden="true"></span>
              </button>
              <button class="theme-side-icon ${currentTheme === "midnight" ? "is-active" : ""}" data-action="theme-midnight" aria-label="Midnight theme">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.5 3.5a7.8 7.8 0 1 0 4 14.5 8.6 8.6 0 0 1-4.8 1.4A8.4 8.4 0 0 1 7.3 11a8.6 8.6 0 0 1 9.2-7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                </svg>
              </button>
            </div>
          </label>
          <div class="utility-actions">
            <button class="btn btn--ghost" data-action="close-utility-panel">Close</button>
          </div>
        </div>
      </div>
    `
  }

  return ""
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
        <span class="selection-label">Selected route</span>
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
      <strong>${escapeHtml(workflowName || "unnamed")}</strong>
      <span class="selection-detail">Drag nodes or inspect the generated TOML</span>
    </div>
  `
}

function renderInspector(node) {
  if (pendingEdgeDraft) return ""
  if (!node) return ""

  const isStart = workflowStartNodeId.get() === node.id
  const isEnd = node.type === "end"
  const handler = node.handler ?? ""
  const label = node.label ?? ""

  return `
    <div class="node-inspector node-${isStart ? "start" : (node.type || "task")} card card--raised">
      <div class="inspector-head">
        <div class="inspector-head-icon">${nodeIcon(node.id, node.type)}</div>
        <div class="inspector-title">${node.label?.trim() || node.id}</div>
      </div>
      <div class="inspector-body">
        <label class="inspector-field">
          <span>Label</span>
          <input id="node-label-input" class="input" type="text" value="${escapeHtml(label)}" />
        </label>
        <label class="inspector-field">
          <span>ID</span>
          <input id="node-id-input" class="input" type="text" value="${escapeHtml(node.id)}" />
        </label>
        <label class="inspector-field">
          <span>Handler</span>
          <input id="node-handler-input" class="input" type="text" value="${escapeHtml(handler)}" placeholder="tenant.workflow.step" />
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
          <button class="btn btn--secondary" id="rename-node-btn">Apply</button>
          <button class="btn btn--secondary" id="cancel-node-btn">Cancel</button>
          <button class="btn btn--ghost" id="delete-node-btn">Delete</button>
        </div>
      </div>
    </div>
  `
}

function renderEdgeInspector(edge) {
  if (pendingEdgeDraft) return ""
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
    <div class="edge-inspector card card--raised">
      <div class="inspector-head">
        <div class="inspector-head-icon">${routeIcon()}</div>
        <div class="inspector-title">Route</div>
      </div>
      <div class="inspector-body">
        <div class="inspector-readonly">${edge.from} -> ${edge.to}</div>
        <label class="inspector-field">
          <span>Target</span>
          <button class="edge-target-trigger btn btn--secondary" id="edge-target-trigger" type="button">
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
            <input id="edge-route-input" class="input" type="text" value="${edge.route ?? ""}" />
          </label>
        ` : ""}
        <div class="inspector-actions">
          <button class="btn btn--secondary" id="apply-edge-btn">Apply</button>
          <button class="btn btn--secondary" id="cancel-edge-btn">Cancel</button>
          <button class="btn btn--ghost" id="delete-edge-btn">Delete</button>
        </div>
      </div>
    </div>
  `
}

function renderPendingEdgeDraftInspector() {
  if (!pendingEdgeDraft) return ""

  return `
    <div class="edge-inspector pending-edge-inspector card card--raised">
      <div class="inspector-head">
        <div class="inspector-head-icon">${routeIcon()}</div>
        <div class="inspector-title">New Connection</div>
      </div>
      <div class="inspector-body">
        <div class="inspector-readonly">${pendingEdgeDraft.from} -> ${pendingEdgeDraft.to}</div>
        <label class="inspector-field">
          <span>Route name</span>
          <input id="pending-edge-route-input" class="input" type="text" value="${escapeHtml(pendingEdgeDraft.route ?? "")}" />
        </label>
        ${pendingEdgeDraft.error ? `<div class="inspector-error"><span class="badge badge--warning">${escapeHtml(pendingEdgeDraft.error)}</span></div>` : ""}
        <div class="inspector-hint">Leave blank to create the default continue path.</div>
        <div class="inspector-actions">
          <button class="btn btn--secondary" id="apply-pending-edge-btn">Apply</button>
          <button class="btn btn--secondary" id="cancel-pending-edge-btn">Cancel</button>
        </div>
      </div>
    </div>
  `
}

function renderNodes() {
  const selectedId = getSelectedNode()?.id
  const pendingId = pendingConnectionFrom.get()

  return Object.values(nodes.get())
    .map((node) => {
      const isStart = workflowStartNodeId.get() === node.id
      const classes = ["node-card", `node-${node.type || "task"}`]
      if (isStart) classes.push("node-start")
      if (selectedId === node.id) classes.push("selected")
      if (pendingId === node.id) classes.push("pending")

      const icon = nodeIcon(node.id, node.type)
      const handler = node.handler ?? ""
      const subline = handler.split(".").pop() || (isStart ? "start" : (node.type || "task"))
      const title = node.label?.trim() || node.id

      return `
        <div class="${classes.join(" ")}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px;width:${NODE_WIDTH}px;height:${NODE_HEIGHT}px">
          <span class="node-handle node-handle-in"></span>
          <div class="node-icon">${icon}</div>
          <div class="node-content">
            ${editingLabelNodeId === node.id
              ? `<input class="node-title-input" data-label-editor="${node.id}" type="text" value="${escapeHtml(node.label ?? "")}" placeholder="${escapeHtml(node.id)}" />`
              : `<div class="node-title">${escapeHtml(title)}</div>`}
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
        <foreignObject x="${mx - 52}" y="${my - 13}" width="104" height="28">
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
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="7.8" refY="5" orient="auto">
          <path d="M 1 1 L 8 5 L 1 9" class="edge-arrow"></path>
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
    tomlEditor.addEventListener("focus", () => {
      surfaceActive = false
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

  document.querySelectorAll("[data-node-id]").forEach((el) => {
    el.addEventListener("mousedown", onNodeMouseDown)
    el.addEventListener("click", onNodeClick)
    el.addEventListener("dblclick", onNodeDoubleClick)
  })

  document.querySelectorAll("[data-handle-out]").forEach((el) => {
    el.addEventListener("mousedown", onHandleMouseDown)
  })

  document.querySelectorAll("[data-edge-id]").forEach((el) => {
    el.addEventListener("click", onEdgeClick)
  })

  bindInspectorEvents()
  bindPendingEdgeDraftEvents()
  bindEdgeInspectorEvents()
  bindInlineLabelEditor()

  document.querySelectorAll(".node-inspector input, .node-inspector button, .edge-inspector input, .edge-inspector button, .pending-edge-inspector input, .pending-edge-inspector button, .utility-panel input, .utility-panel button").forEach((el) => {
    el.addEventListener("focus", () => {
      surfaceActive = false
    })
  })
}

function onAction(action) {
  if (action === "workflow-panel") {
    surfaceActive = false
    utilityPanel = utilityPanel === "workflow" ? null : "workflow"
    requestRender()
    return
  }

  if (action === "settings-panel") {
    surfaceActive = false
    utilityPanel = utilityPanel === "settings" ? null : "settings"
    requestRender()
    return
  }

  if (action === "close-utility-panel") {
    surfaceActive = false
    utilityPanel = null
    requestRender()
    return
  }

  if (action === "theme-light") {
    surfaceActive = false
    currentTheme = "light"
    applyTheme(currentTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
    } catch {}
    requestRender()
    return
  }

  if (action === "theme-midnight") {
    surfaceActive = false
    currentTheme = "midnight"
    applyTheme(currentTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
    } catch {}
    requestRender()
    return
  }

  if (action === "load-from-toml") {
    surfaceActive = false
    utilityPanel = null
    applyTomlDraft()
    return
  }

  if (action === "download-workflow") {
    surfaceActive = false
    downloadCurrentWorkflow()
    return
  }

  if (action === "add-node") {
    surfaceActive = true
    createNodeAtViewportCenter()
    requestRender()
    return
  }

  if (action === "layout") {
    surfaceActive = true
    applyAutoLayout()
    fitViewport()
    requestRender()
    return
  }

  if (action === "zoom-in") {
    surfaceActive = true
    zoomAroundCanvasCenter(1.12)
    requestRender()
    return
  }

  if (action === "zoom-out") {
    surfaceActive = true
    zoomAroundCanvasCenter(1 / 1.12)
    requestRender()
    return
  }

  if (action === "zoom-fit") {
    surfaceActive = true
    fitViewport()
    requestRender()
    return
  }

  if (action === "copy-toml") {
    const text = tomlDraft || exportWorkflow(inferStartNode(), workflowName)
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
    surfaceActive = false
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
      const labelInput = document.querySelector("#node-label-input")
      const idInput = document.querySelector("#node-id-input")
      const handlerInput = document.querySelector("#node-handler-input")
      const startInput = document.querySelector("#node-start-input")
      const endInput = document.querySelector("#node-end-input")
      if (!labelInput || !idInput || !handlerInput || !startInput || !endInput) return

      const nextId = idInput.value.trim()
      try {
        if (nextId && nextId !== selectedNode.id) {
          renameNode(selectedNode.id, nextId)
        }
        const resolvedId = nextId || selectedNode.id
        setNodeField(resolvedId, "label", labelInput.value.trim())
        setNodeField(resolvedId, "handler", handlerInput.value.trim())
        setNodeType(resolvedId, endInput.checked ? "end" : "task")
        if (startInput.checked) {
          setStartNode(resolvedId)
        } else if (workflowStartNodeId.get() === resolvedId) {
          setStartNode(Object.keys(nodes.get()).find((id) => id !== resolvedId) ?? resolvedId)
        }
        clearSelection()
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

  const cancelBtn = document.querySelector("#cancel-node-btn")
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      clearSelection()
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

  const targetMenu = document.querySelector(".edge-target-menu")
  if (targetMenu) {
    targetMenu.addEventListener("wheel", (event) => {
      event.stopPropagation()
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
        edgeInspectorState = { edgeId: null, target: "", targetMenuOpen: false }
        clearSelection()
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

  const cancelBtn = document.querySelector("#cancel-edge-btn")
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      edgeInspectorState = { edgeId: null, target: "", targetMenuOpen: false }
      clearSelection()
      requestRender()
    })
  }
}

function bindPendingEdgeDraftEvents() {
  if (!pendingEdgeDraft) return

  const applyBtn = document.querySelector("#apply-pending-edge-btn")
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      try {
        commitPendingEdgeDraft()
      } catch (err) {
        pendingEdgeDraft = {
          ...pendingEdgeDraft,
          route: document.querySelector("#pending-edge-route-input")?.value ?? "",
          error: err instanceof Error ? err.message : String(err)
        }
      }
      requestRender()
    })
  }

  const cancelBtn = document.querySelector("#cancel-pending-edge-btn")
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      pendingEdgeDraft = null
      requestRender()
    })
  }
}

function bindInlineLabelEditor() {
  const editor = document.querySelector("[data-label-editor]")
  if (!editor) return

  editor.addEventListener("mousedown", (event) => {
    event.stopPropagation()
  })

  editor.addEventListener("click", (event) => {
    event.stopPropagation()
  })

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      commitInlineLabelEdit(editor.dataset.labelEditor, editor.value)
    }

    if (event.key === "Escape") {
      event.preventDefault()
      editingLabelNodeId = null
      requestRender()
    }
  })

  editor.addEventListener("blur", () => {
    commitInlineLabelEdit(editor.dataset.labelEditor, editor.value)
  })

  queueMicrotask(() => {
    editor.focus()
    editor.select()
  })
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
  surfaceActive = true
  clearSelection()
  requestRender()
}

function onCanvasMouseDown(event) {
  if (!isCanvasBackgroundTarget(event.target)) return
  surfaceActive = true
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
  surfaceActive = true
  if (editingLabelNodeId) return
  const nodeId = event.currentTarget.dataset.nodeId

  selectNode(nodeId)
  requestRender()
}

function onEdgeClick(event) {
  event.stopPropagation()
  surfaceActive = true
  selectEdge(event.currentTarget.dataset.edgeId)
  requestRender()
}

function onNodeMouseDown(event) {
  surfaceActive = true
  if (editingLabelNodeId) return
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

function onNodeDoubleClick(event) {
  event.stopPropagation()
  surfaceActive = false
  const nodeId = event.currentTarget.dataset.nodeId
  if (!nodeId) return
  editingLabelNodeId = nodeId
  requestRender()
}

function onHandleMouseDown(event) {
  event.stopPropagation()
  surfaceActive = true
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
        createConnectionDraft(sourceId, targetId)
      }
    } else if (target instanceof Element && isCanvasBackgroundTarget(target)) {
      const point = clientToWorld(event.clientX, event.clientY)
      const createdId = createNodeAt(point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2)
      createConnectionDraft(sourceId, createdId)
    }
  } catch (err) {
    window.alert(err.message)
  }

  startConnection(null)
  pointerWorld = null
  requestRender()
}

function onKeyDown(event) {
  if (!surfaceActive) return

  if (event.key === "Escape" && utilityPanel) {
    utilityPanel = null
    requestRender()
    return
  }

  if (event.key === "Escape" && pendingEdgeDraft) {
    pendingEdgeDraft = null
    requestRender()
    return
  }

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

function routeIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M10 17h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <circle cx="6" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
      <circle cx="18" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
      <path d="M13 7c4 0 5 3 5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
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

function viewportCenterWorld() {
  const canvas = document.querySelector("#canvas")
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }
  return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
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

function createConnectionDraft(sourceId, targetId) {
  clearSelection()
  pendingEdgeDraft = {
    from: sourceId,
    to: targetId,
    route: "",
    error: ""
  }
}

function commitPendingEdgeDraft() {
  if (!pendingEdgeDraft) return

  const routeInput = document.querySelector("#pending-edge-route-input")
  const routeName = routeInput?.value.trim() ?? pendingEdgeDraft.route ?? ""

  if (!routeName) {
    connectNodes(pendingEdgeDraft.from, pendingEdgeDraft.to, "continue")
  } else {
    connectNodes(pendingEdgeDraft.from, pendingEdgeDraft.to, "route", routeName)
  }

  pendingEdgeDraft = null
}

async function applyTomlDraft() {
  try {
    if (!("global" in globalThis)) {
      globalThis.global = globalThis
    }
    const { loadWorkflow } = await import("./toml-import.js")
    const wf = loadWorkflow(tomlDraft)
    workflowName = String(wf.workflow ?? "").trim() || "unnamed"
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

function loadTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === "light" ? "light" : "midnight"
  } catch {
    return "midnight"
  }
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.removeAttribute("data-theme")
    return
  }
  document.documentElement.setAttribute("data-theme", "midnight")
}

function toggleTheme() {
  currentTheme = currentTheme === "midnight" ? "light" : "midnight"
  applyTheme(currentTheme)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
  } catch {
    // Ignore storage failures.
  }
  requestRender()
}

function downloadCurrentWorkflow() {
  const toml = tomlDraft || exportWorkflow(inferStartNode(), workflowName)
  const blob = new Blob([toml], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${(workflowName || "unnamed").trim() || "unnamed"}.toml`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  utilityPanel = null
  requestRender()
}

function commitInlineLabelEdit(nodeId, nextLabel) {
  if (nodeId && nodes.get()[nodeId]) {
    setNodeField(nodeId, "label", nextLabel.trim())
  }
  editingLabelNodeId = null
  requestRender()
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
