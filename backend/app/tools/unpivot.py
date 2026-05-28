import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class UnpivotNode(BaseNode):
    MANIFEST = {
        "id": "unpivot",
        "name": "Unpivot",
        "category": "transform",
        "icon": "ArrowDownUp",
        "description": "Convert wide data to long data.",
        "ui_schema": [
            {"field": "id_vars", "type": "column_multi_select", "label": "Identifier Columns (Group)", "default": []},
            {"field": "value_vars", "type": "column_multi_select", "label": "Data Columns to Pivot", "default": []},
            {"field": "variable_name", "type": "text", "label": "New Variable Column Name", "default": "name"},
            {"field": "value_name", "type": "text", "label": "New Value Column Name", "default": "value"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Unpivot node requires an incoming data stream.")

        id_vars = self.parameters.get("id_vars", [])
        value_vars = self.parameters.get("value_vars", [])
        variable_name = self.parameters.get("variable_name", "name") or "name"
        value_name = self.parameters.get("value_name", "value") or "value"

        self.log(f"Unpivoting data: id_vars={id_vars}, value_vars={value_vars}, var_name={variable_name}, val_name={value_name}")
        
        try:
            res_df = df.unpivot(
                index=id_vars if id_vars else None,
                on=value_vars if value_vars else None,
                variable_name=variable_name,
                value_name=value_name
            )
        except Exception as e:
            raise ValueError(f"Unpivot failed: {str(e)}")
            
        return res_df
