import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class DataProfilerNode(BaseNode):
    MANIFEST = {
        "id": "data_profiler",
        "name": "Data Profiler",
        "category": "prep",
        "icon": "Activity",
        "description": "Analyzes the dataset and returns a profile describing nulls, completeness, distinct counts, and data types for each column.",
        "ui_schema": []
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Data Profiler requires an incoming data stream.")

        if len(df) == 0:
            self.log("Input dataframe is empty. Returning empty profile.")
            return pl.DataFrame({
                "Column": [], "Type": [], "Null_Count": [], "Null_Percentage": [], 
                "Valid_Count": [], "Valid_Percentage": [], "Distinct_Count": []
            })

        total_rows = len(df)
        self.log(f"Profiling {total_rows} rows across {len(df.columns)} columns.")

        profile_rows = []
        for col_name in df.columns:
            series = df[col_name]
            null_count = series.null_count()
            valid_count = total_rows - null_count
            null_percentage = round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
            valid_percentage = round((valid_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
            
            try:
                distinct_count = series.n_unique()
            except Exception:
                distinct_count = None
                
            dtype_str = str(series.dtype)

            profile_rows.append({
                "Column": col_name,
                "Type": dtype_str,
                "Null_Count": null_count,
                "Null_Percentage": null_percentage,
                "Valid_Count": valid_count,
                "Valid_Percentage": valid_percentage,
                "Distinct_Count": distinct_count
            })

        profile_df = pl.DataFrame(profile_rows)
        self.log("Profiling complete.")
        return profile_df
