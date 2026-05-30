import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class SelectNode(BaseNode):
    MANIFEST = {
        "id": "select",
        "name": "Select",
        "category": "prep",
        "icon": "Columns",
        "description": "Select, rename, and cast columns.",
        "ui_schema": [
            {
                "field": "columns", 
                "type": "select_rename_table", 
                "label": "Select / Rename Columns", 
                "default": [],
                "properties": {
                    "name": {"type": "string", "label": "Original Name"},
                    "keep": {"type": "boolean", "label": "Visibility"},
                    "rename": {"type": "string", "label": "Target Mapping"},
                    "type": {"type": "string", "label": "Data Type Cast"},
                    "order_index": {"type": "integer", "label": "Tracing Position"}
                }
            },
            {"field": "action_select_all", "type": "trigger", "label": "Select All", "default": False},
            {"field": "action_deselect_all", "type": "trigger", "label": "Deselect All", "default": False},
            {"field": "action_invert", "type": "trigger", "label": "Invert Selection", "default": False}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Select node requires an incoming data stream.")

        columns_config = self.parameters.get("columns", [])

        if not columns_config:
            self.log("No column configurations provided. Passing input data unchanged.")
            return df

        try:
            # Structural Ordering Logic
            columns_config_sorted = sorted(columns_config, key=lambda x: x.get("order_index", 999999))
            
            expressions = []
            
            for col_cfg in columns_config_sorted:
                name = col_cfg.get("name")
                keep = col_cfg.get("keep", True)
                rename = col_cfg.get("rename", "")
                target_type = col_cfg.get("type", "")
                
                if not name or not keep:
                    continue
                    
                if name not in df.columns:
                    self.log(f"Warning: Column '{name}' is missing from the upstream schema. Gracefully passing over.")
                    continue
                    
                # Construct selection statement
                expr = pl.col(name)
                
                # Safely cast the column type with protective bounds
                if target_type:
                    pl_type = self._map_to_polars_type(target_type)
                    expr = expr.cast(pl_type, strict=False)
                    
                # Apply alias if rename differs from original name
                if rename and rename != name:
                    expr = expr.alias(rename)
                    
                expressions.append(expr)

            if not expressions:
                self.log("No columns selected to keep. Returning empty dataframe with original schema.")
                return df.select([])
                
            self.log(f"Applying select transformations for {len(expressions)} columns.")
            res_df = df.select(expressions)
            
            self.log(f"Columns after select/rename/cast: {res_df.columns}")
            return res_df

        except Exception as e:
            self.log(f"Diagnostic Tracing: Exception occurred during selection mapping -> {str(e)}")
            raise ValueError(f"Selection mapping execution failed: {str(e)}")

    def _map_to_polars_type(self, type_str: str) -> pl.DataType:
        type_str = type_str.lower()
        if type_str in ["int64", "integer", "int"]:
            return pl.Int64
        elif type_str in ["float64", "float", "decimal", "numerical"]:
            return pl.Float64
        elif type_str in ["boolean", "bool"]:
            return pl.Boolean
        return pl.String
