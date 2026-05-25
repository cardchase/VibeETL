import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class SortNode(BaseNode):
    MANIFEST = {
        "id": "sort",
        "name": "Sort",
        "category": "prep",
        "icon": "ArrowUpDown",
        "description": "Sort rows by a column.",
        "ui_schema": [
            {"field": "column", "type": "column_select", "label": "Sort Column", "default": ""},
            {"field": "descending", "type": "boolean", "label": "Sort Descending", "default": False}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        column = self.parameters.get("column", "")
        descending = self.parameters.get("descending", False)

        if not column:
            self.log("No column specified for sorting. Passing input data unchanged.")
            return df

        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found in input dataframe. Available columns: {df.columns}")

        direction = "descending" if descending else "ascending"
        self.log(f"Sorting by column '{column}' in {direction} order.")
        
        res_df = df.sort(column, descending=descending)
        self.log(f"Successfully sorted {res_df.height} rows.")
        return res_df
