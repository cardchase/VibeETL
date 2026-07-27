# VibeETL Developer Notes

## May 31, 2026 - Summary of Changes
Today we implemented a significant number of architectural, backend, and UI/UX improvements to VibeETL. The primary focus was on extending the tool ecosystem and refining the canvas interaction model.

### 1. New Database Integrations
- Created `Database Input` and `Database Output` nodes.
- Integrated support for MySQL, PostgreSQL, and SQLite using `connectorx` and SQLAlchemy.
- Implemented secure credential management and dynamic table reflection.

### 2. Global Cloud Authentication
- Overhauled the `Google Sheets In` and `Google Sheets Out` tools.
- Removed the requirement for users to specify JSON paths directly in every node.
- Introduced a unified Global Cloud Credentials manager in the Top Toolbar (`ToolPalette.jsx`).
- Users can now upload `Service Account JSON` or `OAuth 2.0 Client Secret` files once, which are securely stored and cached, authenticating all downstream Google Cloud nodes automatically.
- Added credential purging capabilities for security.

### 3. Subprocess Execution Architecture
- Radically refactored the Python execution engine (`python_code.py`).
- Scripts are now launched in isolated background processes via `subprocess.run()`.
- This fundamentally solves namespace contamination between node executions.
- Unlocks pure, unrestricted access to the host machine's hardware, meaning users can now execute GPU-accelerated code (e.g., Nvidia RAPIDS `cudf`, `cuml`, PyTorch) without being constrained by the FastAPI server's thread pool.

### 4. Canvas UI & ReactFlow Overhaul
- Addressed a severe UX issue where drawing a selection box was accidentally highlighting incorrect tools (like the `Join` node) due to a display scaling bug stretching the box bounds.
- Upgraded the ReactFlow configuration to `SelectionMode.Full`. Nodes are now only selected if the drag box completely engulfs them, mitigating the visual width bug.
- Re-styled the "Multiple Tools Selected" configuration panel.
- Added a real-time list of all currently selected tools.
- Added a dropdown to surgically add unselected tools to the active selection group.
- Added an 'X' button to instantly deselect individual tools from the group without needing to redraw the selection box.
- Explained the visual red-wire behavior (which indicates execution failures `status === 'error'`, rather than selection).

### 5. Housekeeping
- Purged temporary testing files (`test.db`, `test_sheet.csv`) from the root directory to maintain repository cleanliness.
- Updated documentation and `Nodes_Reference.md` to showcase the new GPU capabilities.

## June 9, 2026 - Batch Processing & Folder Ingestion
- Implemented `Folder Input` node to recursively scan local directories and output a DataFrame containing file metadata (FilePath, FileName, Extension, Size).
- Implemented `Dynamic Input` node to iterate through a list of file paths (like those output by Folder Input) and dynamically read and merge standard data files (CSV, Excel) into a single Polars DataFrame. It uses `pl.concat(..., how="diagonal")` to handle heterogeneous schemas smoothly.
  - **New Feature**: Added optional Reference Schema validation. If a `referenceFilePath` is provided, the node extracts its schema and compares all incoming batch files against it, logging detailed missing/extra column warnings. Added a "Strict (Align to Reference)" mode that pads missing columns with nulls and permanently drops extra columns to guarantee a 1:1 structural match to the reference template.
- Upgraded `Image Ingest` node to natively support batch processing. When a DataFrame with a `FilePath` column (e.g. from `Folder Input`) is connected, it automatically iterates and processes all images instead of relying on the single-image configuration field.
- Fixed a frontend UI bug where text inputs (like Custom Prompts) were not rendering in node configuration panels.

## June 9, 2026 - Workflow Cancellation & Engine Stability
- Implemented **Global Workflow Cancellation**: Users can now stop a running pipeline instantly. The execution engine (`engine.py`) has been upgraded to respect a `_global_cancel_flag` in the memory cache, aborting the topological sort loop gracefully without crashing the server.
- Implemented **Per-Node Interactive Cancellation**: Added an interactive hover-state to the spinning loader on the ReactFlow canvas (`CustomNode.jsx`). Users can hover over any running node and click the red Stop square to send a targeted kill signal to just that node (`POST /api/cancel/{node_id}`).
- Upgraded the `Image Ingest` tool to explicitly check `self.is_cancelled()` during its image batch loop, allowing it to safely abort mid-execution without waiting for 100+ images to finish processing. Downstream nodes naturally fail due to missing dependencies, while upstream cached data remains fully intact.
- Resolved a critical threadpool deadlock issue where the development server would hang completely if auto-reloaded while a background execution thread was running an uncancellable loop.
- Built a high-concurrency **OddsPortal Web Scraper** using Playwright Stealth. Mitigated React DOM race conditions with aggressive JS injection checks and 15s element wait tolerances. Guaranteed full data-scrape pipelines for betting odds using strict regex clamps.