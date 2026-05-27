# VibeETL AI Agent Rules and Design Patterns

When assisting with VibeETL, please strictly adhere to the following design patterns and platform rules:

## 1. Platform Philosophy
VibeETL is modeled after enterprise data engineering tools (like Alteryx). It features a visual DAG (Directed Acyclic Graph) canvas where nodes represent data operations (inputs, transforms, filters, joins, outputs).

## 2. Core Features
- **1-to-N Branching:** Output from any single node port can be routed to multiple downstream nodes simultaneously. This is fully supported natively by the frontend (React Flow) and backend (Polars immutable DataFrames).
- **Node Caching (Smart Execution):**
  - Users can manually "Cache" a node via the `[Cache & Run Node]` button in the top Tool Palette or the Database icon in the Config Window.
  - When a node is cached, the backend explicitly performs DAG Pruning using backward traversal. 
  - Any upstream nodes that *only* feed into the cached node will NOT be executed, bypassing heavy disk reads or network calls.
- **Multi-Tabbed Workspaces:** 
  - The React frontend utilizes a tabbed interface, storing independent React Flow instances in an array. Features interacting with the canvas must operate exclusively on the currently `activeTab` to ensure isolated state execution.

## 3. UI/UX Rules
- **No Hidden Features:** Core workflow actions (like Caching) must be prominently displayed (e.g., in the top Tool Palette) rather than hidden in right-click OS menus or tiny sidebar icons.
- **Visual Feedback:** All state changes must have visual indicators (e.g., glowing Database icons on the canvas for cached nodes).
- **Vibrant Aesthetics:** Stick to modern, glassmorphic, and dynamic design principles (vibrant colors, subtle glows, rounded corners, micro-animations). 
- **Tooltips:** All new header buttons, canvas elements, and tool palette items MUST include descriptive `title` attributes to act as tooltips.
- **Data Loss Protection:** Any state modification that can be lost on refresh MUST be hooked into the global `isDirty` autosave manager to trigger `beforeunload` warnings and backend auto-recovery.

## 4. Backend Engine Rules
- Use `polars` for all DataFrame transformations. 
- Ensure that memory is shared across downstream branches (zero-copy when possible) and never duplicated unnecessarily.
- The Engine (`engine.py`) uses a `TopologicalSorter` combined with graph pruning. When implementing new features that affect execution order, always preserve the DAG Pruning logic to ensure cached nodes successfully short-circuit their upstream dependencies.
