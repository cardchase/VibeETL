import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class PivotNode(BaseNode):
    MANIFEST = {
        "id": "pivot",
        "name": "Pivot",
        "category": "transform",
        "icon": "ArrowLeftRight",
        "description": "Pivot long data to wide data.",
        "ui_schema": [
            {"field": "index", "type": "column_multi_select", "label": "Group By (Index)", "default": []},
            {"field": "columns", "type": "column_select", "label": "Column Headers", "default": ""},
            {"field": "values", "type": "column_select", "label": "Data Values", "default": ""},
            {"field": "aggregate_function", "type": "select", "label": "Aggregation Method", "options": ["sum", "mean", "count", "min", "max", "first", "last"], "default": "sum"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        index = self.parameters.get("index", [])
        columns = self.parameters.get("columns", "")
        values = self.parameters.get("values", "")
        agg_func_name = self.parameters.get("aggregate_function", "sum")

        if not index or not columns or not values:
            self.log("Pivot requires Index, Columns, and Values configurations.")
            return df

        self.log(f"Pivoting data: index={index}, columns={columns}, values={values}, agg={agg_func_name}")
        
        try:
            res_df = df.pivot(
                values=values,
                index=index,
                on=columns,
                aggregate_function=agg_func_name
            )
        except Exception as e:
            raise ValueError(f"Pivot failed: {str(e)}")
            
        return res_df
