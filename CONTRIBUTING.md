# Contributing to VibeETL

Welcome to VibeETL! We are thrilled that you want to contribute to our drag-and-drop data engineering platform.

Because VibeETL's architecture is fully manifest-driven (the frontend UI automatically builds itself based on the backend node's `MANIFEST`), expanding the tool palette is incredibly easy. You only need to write a single Python file!

In fact, it is so easy that **you can generate entire nodes using AI coding assistants in less than 5 minutes.**

## 🤖 The AI Component Blueprint

If you want to contribute a new node (like a special data cleanser, a statistical model, or a new API connector), just copy and paste the following prompt into your favorite AI coding assistant (like Gemini, ChatGPT, or Claude):

```markdown
I am contributing a new data processing node to the open-source VibeETL project. 
VibeETL is a manifest-driven React Flow application with a Python/Polars backend. 
To create a new tool, I only need to create ONE Python file in the `backend/app/tools/` directory.

Please write the Python file for a new node that does: [DESCRIBE YOUR NODE'S PURPOSE HERE, e.g., "Removes all duplicate rows based on a selected column"].

**Technical Requirements:**
1. Inherit from `BaseNode` imported from `app.tools.base`.
2. Define a `MANIFEST` dictionary at the class level containing:
   - `id`: unique string ID (e.g., "myNewTool").
   - `name`: Human readable name.
   - `category`: One of ["inout", "prep", "join", "transform", "analysis"].
   - `icon`: A valid Lucide React icon name (e.g., "Filter", "Database").
   - `description`: Brief description of what it does.
   - `ui_schema`: A list of parameter definition dictionaries to render the frontend UI. Supported types include "string", "number", "boolean", "select", "column_select" (for choosing a column from the dataframe).
3. Override the `execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame` method.
4. Extract parameters using `self.parameters.get("fieldName")`.
5. Process the `inputs["input"]` polars DataFrame and return the modified DataFrame.
6. Use `self.log("message")` to output status updates to the user.

Example structure:
```python
import polars as pl
from typing import Dict
from app.tools.base import BaseNode

class MyNewNode(BaseNode):
    MANIFEST = {
        "id": "myNewNode",
        "name": "My New Node",
        "category": "prep",
        "icon": "Wand2",
        "description": "Does something cool.",
        "ui_schema": [
            {"field": "my_param", "type": "string", "label": "My Parameter", "default": "hello"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs["input"]
        my_param = self.parameters.get("my_param", "hello")
        self.log(f"Running tool with param {my_param}")
        # ... polars logic ...
        return df
```
Please generate the complete python file!
```

### Next Steps:
1. Copy the generated code.
2. Save it as a `.py` file inside the `backend/app/tools/` directory.
3. Start the application. The frontend will dynamically parse your file, inject it into the tool sidebar, and render its configuration UI automatically!
4. Open a Pull Request on GitHub to share your new tool with the community.
