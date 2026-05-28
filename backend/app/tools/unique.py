import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

MANIFEST = {
    "id": "unique",
    "name": "Unique",
    "category": "prep",
    "icon": "Fingerprint",
    "ui_schema": [
        {
            "field": "columns",
            "label": "Columns to Determine Uniqueness (leave empty for all)",
            "type": "column_multi_select",
            "default": []
        },
        {
            "field": "keep",
            "label": "Which Duplicate to Keep",
            "type": "select",
            "options": ["first", "last", "any", "none"],
            "default": "first"
        }
    ],
    "defaultParams": {
        "columns": [],
        "keep": "first"
    }
}

class UniqueNode(BaseNode):
    def __init__(self, node_id: str, parameters: Dict[str, Any]):
        super().__init__(node_id, parameters)
        self.columns = parameters.get("columns", [])
        self.keep = parameters.get("keep", "first")

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if not inputs:
            raise ValueError("Awaiting connection: Unique node requires an incoming data stream.")
        
        df = list(inputs.values())[0]
        
        # If no columns are specified, deduplicate across all columns
        subset = self.columns if isinstance(self.columns, list) and len(self.columns) > 0 else None
        
        try:
            return df.unique(subset=subset, keep=self.keep, maintain_order=True)
        except Exception as e:
            raise ValueError(f"Failed to extract unique records: {str(e)}")
