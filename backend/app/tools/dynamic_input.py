import os
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class DynamicInputNode(BaseNode):
    MANIFEST = {
        "id": "dynamicInput",
        "name": "Dynamic Input",
        "category": "inout",
        "icon": "FileStack",
        "description": "Dynamically reads and unions multiple files based on a list of file paths from an upstream node.",
        "ui_schema": [
            {"field": "filePathColumn", "type": "column_select", "label": "File Path Column", "default": "FilePath"},
            {"field": "fileType", "type": "select", "label": "File Type", "options": ["Auto-detect", "CSV", "Excel", "JSON", "Parquet"], "default": "Auto-detect"},
            {"field": "onSchemaMismatch", "type": "select", "label": "On Schema Mismatch", "options": ["Union (Auto-Coerce to String)", "Intersect (Drop missing)", "Strict (Align to Reference)", "Error on Type Mismatch"], "default": "Union (Auto-Coerce to String)"},
            {"field": "referenceFilePath", "type": "string", "label": "Reference File Path (Optional)", "default": ""}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if not inputs:
            self.log("Waiting for upstream connection...")
            return pl.DataFrame()
            
        df_input = list(inputs.values())[0]
        if df_input is None or df_input.height == 0:
            self.log("Received empty upstream dataset. Waiting for data...")
            return pl.DataFrame()

        file_path_col = self.parameters.get("filePathColumn", "FilePath")
        if file_path_col not in df_input.columns:
            # Fallback if there's only one string column or try to find one
            for col in df_input.columns:
                if df_input[col].dtype == pl.Utf8:
                    file_path_col = col
                    break

        if file_path_col not in df_input.columns:
            raise ValueError(f"Could not find file path column '{file_path_col}' in upstream data.")

        file_paths = df_input[file_path_col].drop_nulls().to_list()
        if not file_paths:
            self.log("Upstream dataset contains no valid file paths.")
            return pl.DataFrame()

        file_type = self.parameters.get("fileType", "Auto-detect")
        mismatch_behavior = self.parameters.get("onSchemaMismatch", "Union (Auto-Coerce to String)")
        if mismatch_behavior == "Union (Fill Nulls)":
            mismatch_behavior = "Union (Auto-Coerce to String)"
        
        how_concat = "diagonal"
        if mismatch_behavior == "Intersect (Drop missing)":
            how_concat = "vertical" # Wait, vertical requires same schema, diagonal handles mismatched.
            # actually, polars vertical raises error if mismatched.
            # to intersect, we'd need to find common columns first. We will just use diagonal for now, and align if needed.

        dataframes = []
        
        # 1. Establish Reference Schema if provided
        ref_file = self.parameters.get("referenceFilePath", "").strip()
        ref_schema_cols = None
        
        if ref_file:
            ref_path = ref_file if os.path.isabs(ref_file) else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", ref_file))
            if os.path.exists(ref_path):
                self.log(f"Reading reference file: {os.path.basename(ref_file)}")
                ext = os.path.splitext(ref_path)[1].lower()
                try:
                    if ext == ".csv":
                        ref_df = pl.read_csv(ref_path, infer_schema_length=100000, ignore_errors=True)
                    elif ext in [".xlsx", ".xls"]:
                        ref_df = pl.read_excel(ref_path)
                    elif ext == ".json":
                        ref_df = pl.read_json(ref_path)
                    elif ext == ".parquet":
                        ref_df = pl.read_parquet(ref_path)
                    else:
                        ref_df = pl.DataFrame()
                        
                    if ref_df.width > 0:
                        ref_schema_cols = ref_df.columns
                        self.log(f"Established Reference Schema with {len(ref_schema_cols)} columns.")
                except Exception as e:
                    self.log(f"Warning: Failed to read reference schema: {str(e)}")
            else:
                self.log(f"Warning: Reference file not found: {ref_path}")

        self.log(f"Reading {len(file_paths)} files...")

        for idx, path in enumerate(file_paths):
            if not os.path.isabs(path):
                file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", path))
            else:
                file_path = path

            if not os.path.exists(file_path):
                self.log(f"Warning: File not found: {file_path}. Skipping.")
                continue
                
            ext = os.path.splitext(file_path)[1].lower()
            current_type = file_type
            
            if current_type == "Auto-detect":
                if ext == ".csv":
                    current_type = "CSV"
                elif ext in [".xlsx", ".xls"]:
                    current_type = "Excel"
                elif ext == ".json":
                    current_type = "JSON"
                elif ext == ".parquet":
                    current_type = "Parquet"
                else:
                    self.log(f"Warning: Could not auto-detect file type for {file_path}. Skipping.")
                    continue

            try:
                if current_type == "CSV":
                    df = pl.read_csv(file_path, infer_schema_length=100000, ignore_errors=True)
                elif current_type == "Excel":
                    df = pl.read_excel(file_path)
                elif current_type == "JSON":
                    df = pl.read_json(file_path)
                elif current_type == "Parquet":
                    df = pl.read_parquet(file_path)
                else:
                    continue
                    
                # Schema Validation against Reference
                if ref_schema_cols is not None:
                    df_cols = df.columns
                    ref_set = set(ref_schema_cols)
                    df_set = set(df_cols)
                    
                    missing_cols = list(ref_set - df_set)
                    extra_cols = list(df_set - ref_set)
                    
                    if missing_cols or extra_cols:
                        self.log(f"Warning: Schema mismatch in {os.path.basename(file_path)}")
                        if missing_cols:
                            self.log(f"  -> Missing {len(missing_cols)} columns: {missing_cols[:5]}{'...' if len(missing_cols)>5 else ''}")
                        if extra_cols:
                            self.log(f"  -> Extra {len(extra_cols)} columns: {extra_cols[:5]}{'...' if len(extra_cols)>5 else ''}")
                            
                    if mismatch_behavior == "Strict (Align to Reference)":
                        # Pad missing columns with Nulls
                        for c in missing_cols:
                            df = df.with_columns(pl.lit(None).alias(c))
                        # Select only the reference columns in the exact reference order
                        df = df.select(ref_schema_cols)
                        
                # Optionally add a column tracking the source file
                df = df.with_columns(pl.lit(os.path.basename(file_path)).alias("SourceFile"))
                dataframes.append(df)
            except Exception as e:
                self.log(f"Error reading {file_path}: {str(e)}")
                if mismatch_behavior == "Error on Type Mismatch":
                    raise RuntimeError(f"Error reading {file_path}: {str(e)}")

        if not dataframes:
            self.log("No valid data could be extracted from the files.")
            return pl.DataFrame()

        self.log(f"Unioning {len(dataframes)} DataFrames...")
        
        try:
            if mismatch_behavior in ["Union (Auto-Coerce to String)", "Strict (Align to Reference)"]:
                # Robust Type Alignment: Resolve type conflicts by casting to String (Utf8)
                col_types = {}
                for df in dataframes:
                    for col, dtype in zip(df.columns, df.dtypes):
                        if col not in col_types:
                            col_types[col] = dtype
                        elif col_types[col] != dtype and col_types[col] != pl.Utf8:
                            col_types[col] = pl.Utf8
                
                aligned_dfs = []
                for df in dataframes:
                    exprs = []
                    for col in df.columns:
                        if df[col].dtype != col_types[col]:
                            exprs.append(pl.col(col).cast(col_types[col]))
                        else:
                            exprs.append(pl.col(col))
                    aligned_dfs.append(df.with_columns(exprs))
                    
                final_df = pl.concat(aligned_dfs, how="diagonal")
            elif mismatch_behavior == "Intersect (Drop missing)":
                # Find common columns
                common_cols = set(dataframes[0].columns)
                for df in dataframes[1:]:
                    common_cols.intersection_update(df.columns)
                
                common_cols_list = list(common_cols)
                if not common_cols_list:
                    raise ValueError("No common columns found across all files.")
                
                # Align types for common columns as well
                col_types = {}
                for df in dataframes:
                    for col in common_cols_list:
                        dtype = df[col].dtype
                        if col not in col_types:
                            col_types[col] = dtype
                        elif col_types[col] != dtype and col_types[col] != pl.Utf8:
                            col_types[col] = pl.Utf8
                            
                aligned_dfs = []
                for df in dataframes:
                    exprs = []
                    for col in common_cols_list:
                        if df[col].dtype != col_types[col]:
                            exprs.append(pl.col(col).cast(col_types[col]))
                        else:
                            exprs.append(pl.col(col))
                    aligned_dfs.append(df.select(common_cols_list).with_columns(exprs))
                    
                final_df = pl.concat(aligned_dfs, how="vertical")
            else: # Error on mismatch
                final_df = pl.concat(dataframes, how="vertical")
                
            self.log(f"Successfully consolidated data into {final_df.height} rows and {final_df.width} columns.")
            return final_df
            
        except Exception as e:
            self.log(f"Error during consolidation: {str(e)}")
            raise RuntimeError(f"Failed to union DataFrames: {str(e)}")
