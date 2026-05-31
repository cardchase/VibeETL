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
