import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class SummarizeNode(BaseNode):
    MANIFEST = {
        "id": "summarize",
        "name": "Summarize",
        "category": "transform",
        "icon": "Sigma",
        "description": "Group by columns and apply aggregate functions (Sum, Count, Min, Max, Mean).",
        "ui_schema": [
            {"field": "group_by", "type": "string", "label": "Group By Column(s) (comma separated)", "default": ""},
            {"field": "agg_column", "type": "column_select", "label": "Aggregation Column", "default": ""},
            {"field": "agg_function", "type": "select", "label": "Aggregation Function", "options": ["sum", "count", "min", "max", "mean"], "default": "sum"},
            {"field": "output_name", "type": "string", "label": "Output Column Name", "default": "Aggregated"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        group_by_raw = self.parameters.get("group_by", "")
        agg_column = self.parameters.get("agg_column", "")
        agg_function = self.parameters.get("agg_function", "sum")
        output_name = self.parameters.get("output_name", "Aggregated")

        if not group_by_raw and not agg_column:
            self.log("No grouping or aggregation specified. Returning original dataframe.")
            return df

        group_by_cols = [c.strip() for c in group_by_raw.split(",")] if group_by_raw else []

        # Verify columns exist
        from app.tools.base import SchemaCompatibilityError
        for col in group_by_cols:
            if col and col not in df.columns:
                raise SchemaCompatibilityError(f"Summarize error: Group by column '{col}' not found. Available: {df.columns}")

        if agg_column and agg_column not in df.columns:
             raise SchemaCompatibilityError(f"Summarize error: Aggregation column '{agg_column}' not found. Available: {df.columns}")

        group_by_cols = [c for c in group_by_cols if c]

        self.log(f"Summarizing data. Group by: {group_by_cols}, Aggregation: {agg_function} on '{agg_column}'")

        try:
            # Build aggregation expression
            agg_expr = None
            if agg_column:
                col_expr = pl.col(agg_column)
                if agg_function == "sum":
                    agg_expr = col_expr.sum().alias(output_name)
                elif agg_function == "count":
                    agg_expr = col_expr.count().alias(output_name)
                elif agg_function == "min":
                    agg_expr = col_expr.min().alias(output_name)
                elif agg_function == "max":
                    agg_expr = col_expr.max().alias(output_name)
                elif agg_function == "mean":
                    agg_expr = col_expr.mean().alias(output_name)
                else:
                    raise ValueError(f"Unknown aggregation function: {agg_function}")

            if group_by_cols:
                grouped = df.group_by(group_by_cols)
                if agg_expr is not None:
                    res_df = grouped.agg(agg_expr)
                else:
                    res_df = grouped.agg(pl.count().alias("count")) # Default to row count if no agg specified
            else:
                if agg_expr is not None:
                     res_df = df.select(agg_expr)
                else:
                    self.log("No aggregation to perform.")
                    return df

            self.log(f"Summarize successful. Result has {res_df.height} rows.")
            return res_df
        except Exception as e:
             self.log(f"Summarize failed: {str(e)}")
             raise ValueError(f"Summarize operation failed: {str(e)}")
