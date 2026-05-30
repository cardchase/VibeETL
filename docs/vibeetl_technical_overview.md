# VibeETL: Technical Architecture & Deep Dive Guide

## 1. Project Overview & Capabilities
**VibeETL** is a modern, node-based ETL (Extract, Transform, Load) desktop-class application designed to process tabular and multi-modal data. Built to rival enterprise platforms like Alteryx, it allows users to visually construct Directed Acyclic Graphs (DAGs) on a canvas to orchestrate complex data flows.

### Core Capabilities
*   **Visual Pipeline Orchestration**: Users drag and drop nodes (tools) onto a canvas, connecting them via ports to define the topological flow of data.
*   **Blazing Fast Execution**: Powered entirely by **Polars**, an aggressively optimized Rust-based DataFrame library, allowing for in-memory multi-threaded data transformations.
*   **Extensive Standard Library**: 29+ built-in nodes spanning Data Input/Output (CSV, Excel, Parquet, JSON, Avro, Databases, GCP, Google Sheets), Preparation (Filter, Sort, Regex), Transformation (Join, Pivot, Select), and AI (Gemini, Local ONNX image captioning).
*   **State-of-the-Art Extensibility**: Includes a native `Python Code` node allowing users to run arbitrary Python scripts on the dataset mid-pipeline securely.
*   **Smart Caching Engine**: Implements topological execution that skips processing for nodes whose inputs and configurations haven't changed, significantly speeding up workflow iteration.
*   **Multi-Tab Architecture**: Supports running and autosaving multiple distinct workflows simultaneously in a single session.

---

## 2. Technical Stack
The application relies on a decoupled architecture, using a RESTful and event-driven API bridge between a web-based frontend and a system-native Python backend.

### Frontend
*   **Framework**: React (Vite)
*   **Canvas Engine**: `@xyflow/react` (React Flow) for managing the interactive graph, nodes, and edges.
*   **Styling**: Pure CSS + Lucide React for iconography. 

### Backend
*   **Framework**: FastAPI (served via Uvicorn) for exposing the execution engine and endpoints to the local frontend.
*   **Data Engine**: `polars` for all core tabular data manipulations.
*   **Auxiliary Libraries**: `openpyxl`/`pandas` (for complex Excel sheet routing), local ONNX runtimes for AI, and various Cloud SDKs (Google Cloud Storage, Google Sheets API).

---

## 3. Directory & File Structure
A high-level overview of the most critical files to guide structural understanding:

### `backend/app/` (The Execution Engine)
*   **`main.py`**: The FastAPI entry point. Defines all REST endpoints, manages the global backend cache, and receives the JSON graph payload from the frontend.
*   **`engine/executor.py`**: The core execution planner. It parses the incoming `nodes` and `edges` JSON, constructs an adjacency list, performs a **Topological Sort** to determine the correct order of operations, and executes the nodes sequentially while managing memory and passing DataFrame references.
*   **`tools/base.py`**: Contains the `BaseNode` abstract class. Every ETL tool inherits from this, defining a standard interface (`execute()`, `schema`, etc.).
*   **`tools/*.py`**: The tool registry. Contains individual files for every node (e.g., `file_output.py`, `python_code.py`, `browse.py`, `filter.py`, `join.py`). Each tool implements its unique Polars transformation logic here.

### `frontend/src/` (The UI Application)
*   **`App.jsx`**: The root controller. Manages global state, handles multi-tab autosaving (via `localStorage`), dynamic schema resolution (passing column metadata down the graph visually before execution), and keyboard shortcuts.
*   **`components/Canvas.jsx`**: The React Flow integration. Manages the visual rendering of the graph, snapping mechanics, and node drag-and-drop.
*   **`components/CustomNode.jsx`**: The UI template for all nodes on the canvas. Dynamically renders target/source connection ports, tool icons, status indicators (Running/Success/Error/Skipped), and caches.
*   **`components/ConfigWindow.jsx`**: The dynamic parameter settings panel. It parses a node's `ui_schema` payload from the backend to dynamically render checkboxes, text inputs, and dropdowns for the selected tool.
*   **`components/ResultsWindow.jsx`**: The terminal/preview grid. Displays the JSON-serialized Polars DataFrame to the user for inspection (used heavily by the Browse node).

---

## 4. Current Technical Problems & Challenges
When critically reviewing the architecture, please consider the following ongoing challenges we are actively navigating:

### A. UI-to-Backend State Synchronization
*   **Challenge**: The frontend attempts to eagerly resolve dynamic schemas (e.g., knowing what columns exist) so users can pick columns in dropdowns *before* the pipeline is run. However, complex transformations (like Python Code nodes or dynamic Regex parsing) make it impossible for the frontend to predict the schema perfectly.
*   **Current Workaround**: We rely heavily on passing `"__vibe_html_payload__"` or basic string schemas, but a stronger contract between the execution engine's schema prediction and the UI is needed.

### B. Python Code Node Sandboxing
*   **Challenge**: The `Python Code` node executes raw Python via `exec()`. While this gives ultimate flexibility to the user, it is highly volatile.
*   **Current State**: If a user writes an infinite loop or imports a missing library, it crashes the specific node execution. Managing Python tracebacks and surfacing them elegantly back to the React UI as clean error states without crashing the entire FastAPI worker is a delicate process.

### C. Large Dataset Serialization Bottleneck
*   **Challenge**: While Polars can process 10 million rows in milliseconds in the backend, previewing that data in the frontend (via the `Browse` node or the Results Window) requires serializing the DataFrame to JSON and sending it over HTTP. This crashes the browser tab if not handled carefully.
*   **Current Workaround**: We enforce heavy pagination and strict row limits (e.g., `.head(100)`) when serializing for the frontend. However, this restricts users from searching through the tail-end of their data easily within the UI.

### D. Multi-Modal Data Routing
*   **Challenge**: VibeETL supports Multi-Modal data (images, HTML dashboards) flowing through the same edges as tabular data. Since Polars is designed strictly for tabular structures, we currently hack this by storing HTML strings or Base64 encoded images inside a standard Polars String column (`__vibe_html_payload__`).
*   **Pain Point**: While effective, this creates friction when standard tabular nodes (like `Filter` or `Sort`) accidentally intercept these specialized payload columns.

### E. File System Concurrency and Access
*   **Challenge**: Managing file locks and paths gracefully. Since the frontend operates in a browser sandbox, it relies on passing raw absolute string paths (e.g., `C:/data/output.csv`) to the backend. Escaping issues (Windows backslashes `\` vs. Unix forward slashes `/`) and permissions logic currently require rigid error handling. Furthermore, natively exporting complex reports (like PDFs) directly from Python requires heavy system binaries, which we are attempting to avoid by relying on HTML exports.
