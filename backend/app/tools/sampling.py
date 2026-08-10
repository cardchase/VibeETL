import polars as pl
import numpy as np
from typing import Dict
from app.tools.base import BaseNode

class SamplingNode(BaseNode):
    MANIFEST = {
        "id": "sampling",
        "name": "Sample Records",
        "category": "prep",
        "icon": "TestTubes",
        "description": "Extract a subset of records using various sampling methods (First N, Last N, Random, etc).",
        "ui_schema": [
            {
                "field": "sample_type",
                "type": "select",
                "label": "Sample Method",
                "default": "first_n",
                "options": [
                    {"label": "First N rows", "value": "first_n"},
                    {"label": "Last N rows", "value": "last_n"},
                    {"label": "Skip 1st N rows", "value": "skip_n"},
                    {"label": "1 of every N rows", "value": "every_n"},
                    {"label": "1 in N chance to include each row", "value": "chance_n"},
                    {"label": "First N% of rows", "value": "first_percent"},
                    {"label": "Random N rows (Legacy)", "value": "random_n"}
                ]
            },
            {
                "field": "n_records",
                "type": "number",
                "label": "N =",
                "default": 100
            },
            {
                "field": "group_by",
                "type": "column_multi_select",
                "label": "Group by column (optional)",
                "default": []
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Sampling node requires an incoming data stream.")

        sample_type = self.parameters.get("sample_type", "first_n")
        
        # Legacy fallback
        if sample_type == "first": sample_type = "first_n"
        if sample_type == "last": sample_type = "last_n"
        if sample_type == "random": sample_type = "random_n"
            
        n_records = float(self.parameters.get("n_records", 100))
        group_cols_raw = self.parameters.get("group_by", [])
        
        if isinstance(group_cols_raw, str):
            group_cols = [c.strip() for c in group_cols_raw.split(",") if c.strip()]
        elif isinstance(group_cols_raw, list):
            group_cols = [c.strip() for c in group_cols_raw if isinstance(c, str) and c.strip()]
        else:
            group_cols = []
            
        # Ensure group columns exist
        group_cols = [c for c in group_cols if c in df.columns]

        if sample_type != "chance_n" and n_records <= 0:
            return df.head(0)

        # Base structure to hold our row numbers and group lengths
        if group_cols:
            self.log(f"Applying '{sample_type}' with N={n_records} grouped by {group_cols}")
            df_calc = df.with_columns(
                pl.int_range(0, pl.len()).over(group_cols).alias("__rn__"),
                pl.len().over(group_cols).alias("__glen__")
            )
        else:
            self.log(f"Applying '{sample_type}' with N={n_records} across all rows")
            df_calc = df.with_columns(
                pl.int_range(0, pl.len()).alias("__rn__"),
                pl.len().alias("__glen__")
            )

        if sample_type == "first_n":
            df_filtered = df_calc.filter(pl.col("__rn__") < int(n_records))
            
        elif sample_type == "last_n":
            df_filtered = df_calc.filter((pl.col("__glen__") - pl.col("__rn__")) <= int(n_records))
            
        elif sample_type == "skip_n":
            df_filtered = df_calc.filter(pl.col("__rn__") >= int(n_records))
            
        elif sample_type == "every_n":
            n_int = max(1, int(n_records))
            df_filtered = df_calc.filter(pl.col("__rn__") % n_int == 0)
            
        elif sample_type == "first_percent":
            df_filtered = df_calc.filter(pl.col("__rn__") < (pl.col("__glen__") * (n_records / 100.0)))
            
        elif sample_type == "chance_n":
            # 1 in N chance. We use a uniform random distribution mask.
            n_val = max(1.0, float(n_records))
            mask = np.random.rand(df.height) < (1.0 / n_val)
            # Mask is applied globally, grouping doesn't affect independent probabilities
            df_filtered = df_calc.filter(pl.Series(mask))
            
        elif sample_type == "random_n":
            # Random N rows per group (or globally)
            # Efficient implementation: Assign a random float to all rows, sort by group + random, then take first N per group
            df_rand = df_calc.with_columns(pl.Series("__rand__", np.random.rand(df.height)))
            
            if group_cols:
                df_rand = df_rand.sort(group_cols + ["__rand__"])
                # recompute __rn__ after sorting!
                df_rand = df_rand.with_columns(pl.int_range(0, pl.len()).over(group_cols).alias("__rn_sorted__"))
            else:
                df_rand = df_rand.sort("__rand__")
                df_rand = df_rand.with_columns(pl.int_range(0, pl.len()).alias("__rn_sorted__"))
                
            df_filtered = df_rand.filter(pl.col("__rn_sorted__") < int(n_records)).drop("__rand__", "__rn_sorted__")
        else:
            df_filtered = df_calc

        # Cleanup temporary columns
        drop_cols = [c for c in ["__rn__", "__glen__"] if c in df_filtered.columns]
        if drop_cols:
            df_filtered = df_filtered.drop(drop_cols)

        return df_filtered
