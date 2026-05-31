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

# --- MODE 3: Connected Transformer GPU Acceleration ---
# If you have an Nvidia GPU, use RAPIDS to offload matrix compute at lightning speed!
# Example:
# import cudf
# import cuml
# gpu_df = cudf.from_pandas(df.to_pandas())
# gpu_model = cuml.ensemble.RandomForestClassifier(n_estimators=100)
# gpu_model.fit(gpu_df.drop("Target", axis=1), gpu_df["Target"])
# df_out = pl.from_pandas(gpu_df.to_pandas())

# IMPORTANT: You must always assign your final dataframe to `df_out`!
df_out = df if df is not None else pl.DataFrame()
"""
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        import os
        import tempfile
        import subprocess

        df = inputs.get("input")
        # df can be None if the node is used as a standalone generator!

        code_string = self.parameters.get("code", "")
        if not code_string.strip():
            self.log("No Python code provided. Passing data through unchanged.")
            return df if df is not None else pl.DataFrame()

        self.log("Executing custom Python script securely in an isolated subprocess...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = os.path.join(temp_dir, "temp_input.arrow")
            output_path = os.path.join(temp_dir, "temp_output.arrow")
            script_path = os.path.join(temp_dir, "isolated_runner.py")
            
            if df is not None:
                df.write_ipc(input_path)
            
            script_content = f"""import polars as pl
import os

df = None
if os.path.exists({repr(input_path)}):
    df = pl.read_ipc({repr(input_path)})

# --- USER SCRIPT START ---
{code_string}
# --- USER SCRIPT END ---

if 'df_out' not in locals() or df_out is None:
    if df is not None:
        df_out = df
    else:
        df_out = pl.DataFrame()

if isinstance(df_out, pl.DataFrame):
    df_out.write_ipc({repr(output_path)})
else:
    raise ValueError("The Python script did not result in a Polars DataFrame. Make sure `df_out` is a valid Polars DataFrame.")
"""
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(script_content)

            try:
                # Use strict timeout
                result = subprocess.run(
                    ["python", script_path],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=temp_dir
                )
                
                if result.returncode != 0:
                    err_msg = result.stderr or result.stdout
                    self.log(f"Subprocess Execution Error:\n{err_msg}")
                    raise ValueError(f"Error executing Python code: {err_msg}")
                
                # Retrieve output
                if os.path.exists(output_path):
                    res_df = pl.read_ipc(output_path)
                else:
                    raise ValueError("The Python script did not generate an output dataset.")
                    
            except subprocess.TimeoutExpired:
                err_msg = "Security Intercept: User script exceeded 30-second execution window. Process terminated."
                self.log(err_msg)
                raise ValueError(err_msg)
            except Exception as e:
                self.log(f"Python script isolated execution error: {e}")
                raise ValueError(f"Error executing Python code: {e}")

        self.log(f"Python script executed successfully. Result: {res_df.height} rows, {res_df.width} columns.")
        return res_df
