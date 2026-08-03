import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class UniqueNode(BaseNode):
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
            df_indexed = df.with_row_index("__row_id")
            unique_df_indexed = df_indexed.unique(subset=subset, keep=self.keep, maintain_order=True)
            duplicate_df = df_indexed.join(unique_df_indexed, on="__row_id", how="anti").drop("__row_id")
            unique_df = unique_df_indexed.drop("__row_id")
            return {"unique": unique_df, "duplicate": duplicate_df}
        except Exception as e:
            raise ValueError(f"Failed to extract unique records: {str(e)}")
