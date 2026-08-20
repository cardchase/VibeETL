from typing import Dict, Any, List
import polars as pl
import time
from app.tools.base import BaseNode

class SandboxNode(BaseNode):
    """
    A sandbox node for developing new tools without crashing the main application.
    """
    MANIFEST = {
        "type": "SandboxTool",
        "name": "Sandbox Tool",
        "description": "A tool currently in development inside the sandbox.",
        "category": "Development",
        "icon": "Settings", # Default icon
        "inputs": [{"id": "input", "label": "In", "type": "dataframe"}],
        "outputs": [{"id": "output", "label": "Out", "type": "dataframe"}],
        "ui_schema": [
            {
                "field": "sandbox_param",
                "label": "Sandbox Parameter",
                "type": "string",
                "default": ""
            }
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, pl.DataFrame]:
        df = self.get_input_dataframe(inputs)
        if df is None:
            self.log("No input DataFrame provided. Generating mock data.")
            # Generate mock data if no input is connected
            df = pl.DataFrame({
                "MockID": [1, 2, 3],
                "MockData": ["A", "B", "C"]
            })

        self.log(f"Sandbox Tool Executing...")
        param = self.parameters.get("sandbox_param", "")
        self.log(f"Parameter value: {param}")
        
        time.sleep(0.5) # Simulate work
        
        self.log("Execution complete.")
        return {"output": df}
