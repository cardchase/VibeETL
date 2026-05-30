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
                "default": """# The polars library is always imported for you as `pl`
# The incoming Polars DataFrame (if connected) is available as `df`

# --- MODE 1: Standalone Generator (No incoming connection needed!) ---
# You can use the Python node as a starting point to load files or create data.
# Example:
# csv_path = r"C:/Users/name/Downloads/data.csv"
# df_out = pl.read_csv(csv_path)

# --- MODE 2: Connected Transformer (Requires an incoming connection) ---
# If you connect a wire into this node's left port, you can transform `df`.
# Example:
# df_out = df.with_columns(
#     pl.lit("Hello World").alias("New_Column")
# )

# IMPORTANT: You must always assign your final dataframe to `df_out`!
df_out = df if df is not None else pl.DataFrame()
"""
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        # df can be None if the node is used as a standalone generator!

        code_string = self.parameters.get("code", "")
        if not code_string.strip():
            self.log("No Python code provided. Passing data through unchanged.")
            return df if df is not None else pl.DataFrame()

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
