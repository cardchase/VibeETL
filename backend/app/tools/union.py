import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class UnionNode(BaseNode):
    MANIFEST = {
        "id": "union",
        "name": "Union",
        "category": "join",
        "icon": "Layers", 
        "description": "Appends multiple dataframes vertically.",
        "ui_schema": [
            {"field": "how", "type": "select", "label": "Schema Matching", "options": ["diagonal", "vertical"], "default": "diagonal"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        input_data = inputs.get("input")
        if input_data is None:
            raise ValueError("Input dataframe is missing.")

        if isinstance(input_data, list):
            dfs = input_data
        else:
            dfs = [input_data]

        if not dfs:
            raise ValueError("No data received for union.")
            
        how = self.parameters.get("how", "diagonal")
        self.log(f"Unioning {len(dfs)} dataframes using '{how}' mode.")

        try:
            res_df = pl.concat(dfs, how=how)
        except Exception as e:
            self.log(f"Error during concat: {str(e)}")
            raise e

        return res_df
