import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class PythonCodeNode(BaseNode):
    MANIFEST = {
        "id": "python_code",
        "name": "Python Code",
        "category": "analysis",
        "icon": "Code",
        "description": "Execute custom Python scripts against the incoming Polars DataFrame.",
        "ui_schema": [
            {
                "field": "code",
                "type": "code",
                "label": "Python Script",
                "default": """# The incoming Polars DataFrame is available as `df`
# The polars library is imported as `pl`

# --- Example 1: Basic Transformation ---
# df_out = df.with_columns(
#     pl.lit("Hello World").alias("Custom_Output")
# )

# --- Example 2: API Request (e.g. LLM or Web API) ---
# import requests
# def fetch_data(val):
#     # return requests.get(f"https://api.example.com/data?q={val}").json().get("result")
#     return f"Processed: {val}"
# 
# # Apply the function row-by-row (useful for API calls)
# # df_out = df.with_columns(
# #     pl.col("input_column").map_elements(fetch_data, return_dtype=pl.Utf8).alias("api_result")
# # )

# Make sure to assign your final dataframe to `df_out`
df_out = df
"""
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: PythonCode node requires an incoming data stream.")

        code_string = self.parameters.get("code", "")
        if not code_string.strip():
            self.log("No Python code provided. Passing data through unchanged.")
            return df

        self.log("Executing custom Python script...")
        
        # Provide a local environment with `df`, `pl` (polars)
        local_env = {"df": df, "pl": pl}
        
        # Execute the user's code
        try:
            exec(code_string, {}, local_env)
        except Exception as e:
            self.log(f"Python script error: {e}")
            raise RuntimeError(f"Error executing Python code: {e}")

        # The user code should assign to `df_out`
        res_df = local_env.get("df_out")
        
        if res_df is None:
            # Fallback to df if df_out is not set
            res_df = local_env.get("df")

        if not isinstance(res_df, pl.DataFrame):
            raise ValueError("The Python script did not result in a Polars DataFrame. Make sure `df_out` is a valid Polars DataFrame.")

        self.log(f"Python script executed successfully. Result: {res_df.height} rows, {res_df.width} columns.")
        return res_df
