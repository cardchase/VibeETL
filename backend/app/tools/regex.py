import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class RegexNode(BaseNode):
    MANIFEST = {
        "id": "regex",
        "name": "Regex Parser",
        "category": "transform",
        "icon": "Brackets",
        "description": "Extract substrings using Regular Expressions.",
        "ui_schema": [
            {"field": "column", "type": "column_select", "label": "Target Column", "default": ""},
            {"field": "pattern", "type": "string", "label": "Regex Pattern", "default": ""},
            {"field": "outputColumns", "type": "dynamic_output_columns", "label": "Output Columns", "default": []}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        column = self.parameters.get("column", "")
        pattern = self.parameters.get("pattern", "")
        # outputColumns format: list of dicts: [{"name": "AreaCode", "type": "Int64"}]
        output_columns = self.parameters.get("outputColumns", [])

        if not column or not pattern or not output_columns:
            self.log("Missing column, pattern, or output configuration. Passing input data unchanged.")
            return df

        if column not in df.columns:
            from app.tools.base import SchemaCompatibilityError
            raise SchemaCompatibilityError(
                f"Schema Compatibility Error in 'regex' node: Column '{column}' "
                f"is missing from the upstream schema. Available columns: {df.columns}"
            )

        self.log(f"Applying Regex pattern '{pattern}' to column '{column}'.")

        # To extract multiple groups and assign them to multiple columns:
        # Polars str.extract extracts a specific group index. Group 1 is the first capture group.
        
        expressions = []
        for i, col_cfg in enumerate(output_columns):
            name = col_cfg.get("name")
            target_type = col_cfg.get("type", "String")
            if not name:
                continue
                
            # Extract group (1-indexed based on capture groups in the regex)
            # We first cast the target column to String so regex can run on integers/floats etc.
            expr = pl.col(column).cast(pl.String).str.extract(pattern, group_index=i+1).alias(name)
            
            # Apply casting if not String
            pl_type = self._map_to_polars_type(target_type)
            if pl_type != pl.String:
                # strict=False ensures failed regex matches or invalid conversions become Null
                expr = expr.cast(pl_type, strict=False)
                
            expressions.append(expr)

        if expressions:
            df = df.with_columns(expressions)
            self.log(f"Appended {len(expressions)} new columns from regex capture groups.")
            
        return df

    def _map_to_polars_type(self, type_str: str) -> pl.DataType:
        type_str = type_str.lower()
        if type_str in ["int64", "integer", "int"]:
            return pl.Int64
        elif type_str in ["float64", "float", "decimal", "numerical"]:
            return pl.Float64
        elif type_str in ["boolean", "bool"]:
            return pl.Boolean
        return pl.String
