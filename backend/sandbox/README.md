# VibeETL Tool Sandbox

This directory is an isolated sandbox environment for developing new tools without risking crashes to the main application execution engine.

## How it works

1. **Develop in Isolation**: Write your tool class in `new_tool.py` (or any other Python file in this directory). Ensure it inherits from `app.tools.base.BaseNode`.
2. **Visual Harness**: Navigate to `http://localhost:5173/sandbox` in your browser. This hidden route provides a UI harness that mimics the main configuration window.
3. **Execute Safely**: When you click "Test Execution" in the UI harness, it calls `POST /api/sandbox/execute`. This endpoint dynamically loads your code from this folder and runs it.
4. **Deploy**: Once your tool works perfectly, copy it to `app/tools/` and register it in `app/tools/__init__.py`.
