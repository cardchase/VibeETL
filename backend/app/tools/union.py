import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class UnionNode(BaseNode):
    MANIFEST = {
        "id": "union",
        "name": "Union",
        "category": "join",
        "icon": "Layers", 
        "description": "Appends multiple dataframes vertically.",
        "ui_schema": [
            {"field": "how", "type": "select", "label": "Schema Matching", "options": ["diagonal", "vertical"], "default": "diagonal"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        input_data = inputs.get("input")
        if input_data is None:
            raise ValueError("Awaiting connection: Union node requires an incoming data stream.")

        if isinstance(input_data, list):
            dfs = input_data
        else:
            dfs = [input_data]

        if not dfs:
            raise ValueError("No data received for union.")
            
        how = self.parameters.get("how", "diagonal")
        self.log(f"Unioning {len(dfs)} dataframes using '{how}' mode.")

        try:
            # Fast path: try native Polars concat. Polars handles upcasting automatically.
            res_df = pl.concat(dfs, how=how)
        except Exception as fast_path_error:
            self.log(f"Native concat failed ({str(fast_path_error)}). Falling back to schema alignment...")
            try:
                # Fallback: strictly align schemas to prevent mixed-type errors.
                all_cols = {}
                for df in dfs:
                    for name, dtype in df.schema.items():
                        if name not in all_cols:
                            all_cols[name] = set()
                        all_cols[name].add(dtype)

                cast_targets = {}
                for name, dtypes in all_cols.items():
                    if len(dtypes) > 1:
                        # If multiple types exist for the same column, determine a common fallback
                        numeric_types = {pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.Float32, pl.Float64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64}
                        is_all_numeric = all(t in numeric_types for t in dtypes)
                        
                        if is_all_numeric:
                            cast_targets[name] = pl.Float64()
                        else:
                            # Fallback to String for any mixed string/numeric/boolean conflicts
                            cast_targets[name] = pl.String()

                aligned_dfs = []
                for df in dfs:
                    if cast_targets:
                        df_cast = {name: dtype for name, dtype in cast_targets.items() if name in df.columns}
                        if df_cast:
                            aligned_dfs.append(df.cast(df_cast))
                        else:
                            aligned_dfs.append(df)
                    else:
                        aligned_dfs.append(df)

                if cast_targets:
                    self.log(f"Auto-cast {len(cast_targets)} columns with mixed types to prevent schema conflicts.")

                res_df = pl.concat(aligned_dfs, how=how)
            except Exception as fallback_error:
                self.log(f"Error during fallback concat: {str(fallback_error)}")
                raise fallback_error

        return res_df
