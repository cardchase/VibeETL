import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class SortNode(BaseNode):
    MANIFEST = {
        "id": "sort",
        "name": "Sort",
        "category": "prep",
        "icon": "ArrowUpDown",
        "description": "Multi-column sort.",
        # UI is handled by custom ConfigWindow renderer
        "ui_schema": []
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Sort node requires an incoming data stream.")

        rules = self.parameters.get("rules", [])
        
        # Legacy support
        if not rules:
            legacy_col = self.parameters.get("column", "")
            legacy_desc = self.parameters.get("descending", False)
            if legacy_col:
                rules = [{"column": legacy_col, "order": "desc" if legacy_desc else "asc"}]

        if not rules:
            self.log("No columns specified for sorting. Passing input data unchanged.")
            return df

        sort_cols = []
        descending_flags = []
        for rule in rules:
            col = rule.get("column")
            if not col or col not in df.columns:
                self.log(f"Warning: Column '{col}' not found in dataframe. Skipping this sort rule.")
                continue
            
            sort_cols.append(col)
            descending_flags.append(rule.get("order", "asc") == "desc")

        if not sort_cols:
            return df

        self.log(f"Sorting by: {list(zip(sort_cols, descending_flags))}")
        
        res_df = df.sort(sort_cols, descending=descending_flags)
        self.log(f"Successfully sorted {res_df.height} rows.")
        return res_df
