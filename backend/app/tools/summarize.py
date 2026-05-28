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
            {"field": "actions", "type": "summarize_actions", "label": "Summarize Rules", "default": []}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Summarize node requires an incoming data stream.")

        actions = self.parameters.get("actions", [])
        
        # Legacy support
        if not actions:
            group_by_raw = self.parameters.get("group_by", [])
            agg_column = self.parameters.get("agg_column", "")
            agg_function = self.parameters.get("agg_function", "sum")
            output_name = self.parameters.get("output_name", "Aggregated")
            
            if isinstance(group_by_raw, str):
                group_by_cols = [c.strip() for c in group_by_raw.split(",") if c.strip()]
            elif isinstance(group_by_raw, list):
                group_by_cols = [c.strip() for c in group_by_raw if isinstance(c, str) and c.strip()]
            else:
                group_by_cols = []
                
            for g in group_by_cols:
                actions.append({"column": g, "action": "group_by", "output": g})
            if agg_column:
                actions.append({"column": agg_column, "action": agg_function, "output": output_name})

        if not actions:
            self.log("No grouping or aggregation specified. Returning original dataframe.")
            return df

        group_by_cols = []
        agg_exprs = []

        from app.tools.base import SchemaCompatibilityError

        for rule in actions:
            col = rule.get("column")
            action = rule.get("action", "").lower()
            out = rule.get("output") or f"{action}_{col}"
            
            if col not in df.columns:
                raise SchemaCompatibilityError(f"Summarize error: Column '{col}' not found. Available: {df.columns}")

            col_expr = pl.col(col)
            
            if action == "group_by":
                group_by_cols.append(col)
            elif action == "sum":
                agg_exprs.append(col_expr.sum().alias(out))
            elif action == "count":
                agg_exprs.append(col_expr.count().alias(out))
            elif action == "count_unique":
                agg_exprs.append(col_expr.n_unique().alias(out))
            elif action == "min":
                agg_exprs.append(col_expr.min().alias(out))
            elif action == "max":
                agg_exprs.append(col_expr.max().alias(out))
            elif action == "mean":
                agg_exprs.append(col_expr.mean().alias(out))
            elif action == "median":
                agg_exprs.append(col_expr.median().alias(out))
            elif action == "std":
                agg_exprs.append(col_expr.std().alias(out))
            elif action == "var":
                agg_exprs.append(col_expr.var().alias(out))
            elif action == "first":
                agg_exprs.append(col_expr.first().alias(out))
            elif action == "last":
                agg_exprs.append(col_expr.last().alias(out))
            elif action == "concat":
                agg_exprs.append(col_expr.cast(pl.Utf8).str.join(", ").alias(out))
            else:
                raise ValueError(f"Unknown aggregation function: {action}")

        # Deduplicate group by columns to preserve order
        seen = set()
        group_by_cols = [x for x in group_by_cols if not (x in seen or seen.add(x))]

        self.log(f"Summarizing data. Group by: {group_by_cols}, Aggregations: {len(agg_exprs)}")

        try:
            if group_by_cols:
                grouped = df.group_by(group_by_cols, maintain_order=True)
                if agg_exprs:
                    res_df = grouped.agg(agg_exprs)
                else:
                    # If only group by is specified, essentially a unique/distinct operation
                    res_df = df.select(group_by_cols).unique(maintain_order=True)
            else:
                if agg_exprs:
                    res_df = df.select(agg_exprs)
                else:
                    return df

            self.log(f"Summarize successful. Result has {res_df.height} rows and {res_df.width} columns.")
            return res_df
        except Exception as e:
             self.log(f"Summarize failed: {str(e)}")
             raise ValueError(f"Summarize operation failed: {str(e)}")
