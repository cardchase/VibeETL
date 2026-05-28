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
            {"field": "columns", "type": "select_rename_table", "label": "Select / Rename Columns", "default": []}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Select node requires an incoming data stream.")

        # columns parameter format: list of dicts: [{"name": "ColA", "keep": True, "rename": "NewColA"}]
        columns_config = self.parameters.get("columns", [])

        if not columns_config:
            self.log("No column configurations provided. Passing input data unchanged.")
            return df

        # Build list of columns to select and rename mapping
        cols_to_select = []
        rename_map = {}
        type_cast_map = {}

        for col_cfg in columns_config:
            name = col_cfg.get("name")
            keep = col_cfg.get("keep", True)
            rename = col_cfg.get("rename", "")
            target_type = col_cfg.get("type", "")

            if not name:
                continue

            if name not in df.columns:
                from app.tools.base import SchemaCompatibilityError
                raise SchemaCompatibilityError(
                    f"Schema Compatibility Error in 'select' node: Column '{name}' "
                    f"is missing from the upstream schema. Available columns: {df.columns}"
                )

            if keep:
                cols_to_select.append(name)
                final_name = name
                if rename and rename != name:
                    rename_map[name] = rename
                    final_name = rename
                
                if target_type:
                    # Storing the cast logic for the final dataframe
                    type_cast_map[final_name] = self._map_to_polars_type(target_type)

        if not cols_to_select:
            self.log("No columns selected to keep. Returning empty dataframe with original schema.")
            return df.select([])

        self.log(f"Selecting columns: {cols_to_select}")
        res_df = df.select(cols_to_select)

        if rename_map:
            self.log(f"Renaming columns: {rename_map}")
            res_df = res_df.rename(rename_map)

        if type_cast_map:
            self.log(f"Casting columns: {type_cast_map}")
            # strict=False ensures invalid casts become Nulls (NaNs) without crashing the pipeline
            for col_name, pl_type in type_cast_map.items():
                if col_name in res_df.columns:
                    res_df = res_df.with_columns(pl.col(col_name).cast(pl_type, strict=False))

        self.log(f"Columns after select/rename/cast: {res_df.columns}")
        return res_df

    def _map_to_polars_type(self, type_str: str) -> pl.DataType:
        type_str = type_str.lower()
        if type_str in ["int64", "integer", "int"]:
            return pl.Int64
        elif type_str in ["float64", "float", "decimal", "numerical"]:
            return pl.Float64
        elif type_str in ["boolean", "bool"]:
            return pl.Boolean
        return pl.String
