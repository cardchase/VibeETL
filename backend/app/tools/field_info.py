import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class FieldInfoNode(BaseNode):
    """
    FieldInfoNode outputs a metadata summary of the incoming dataframe.
    Similar to Alteryx's Field Info tool, it takes an input and returns
    a new dataframe where each row describes a column from the input.
    """

    MANIFEST = {
        "id": "fieldInfo",
        "name": "Field Info",
        "description": "Output the schema metadata (Name, Type, Null Count, etc.) of the incoming data stream.",
        "icon": "Info",
        "category": "preparation",
        "ui_schema": []
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            # Fallback to the first available input dataframe if "input" isn't found
            if inputs:
                df = list(inputs.values())[0]
            else:
                raise ValueError("Field Info requires an input dataframe.")
            
        self.log(f"Extracting field info for {df.width} columns...")
        
        # We need to construct metadata for each column
        names = df.columns
        types = [str(dtype) for dtype in df.dtypes]
        total_rows = df.height
        
        # Calculate null counts efficiently
        null_counts = df.null_count().row(0)
        
        # Calculate unique counts efficiently
        unique_counts = df.select(pl.all().n_unique()).row(0)
        
        # Calculate fill rate
        fill_rates = [
            f"{((total_rows - nc) / total_rows * 100):.2f}%" if total_rows > 0 else "0.00%"
            for nc in null_counts
        ]
        
        # Try to get a sample value from the first valid row for each column
        sample_values = []
        for col in df.columns:
            # Find first non-null value if possible
            valid_series = df.get_column(col).drop_nulls()
            if valid_series.len() > 0:
                val = valid_series[0]
                # Truncate string representations to keep it tidy
                val_str = str(val)
                if len(val_str) > 50:
                    val_str = val_str[:47] + "..."
                sample_values.append(val_str)
            else:
                sample_values.append(None)
                
        # Optional: Bring in semantic metadata if the execution engine attached it
        semantic_metadata = getattr(self, "_incoming_semantic_metadata", {})
        
        semantic_types = []
        for name in names:
            semantic_types.append(semantic_metadata.get(name, "standard"))
            
        # Construct the output DataFrame
        metadata_df = pl.DataFrame({
            "Name": names,
            "Type": types,
            "Semantic_Type": semantic_types,
            "Total_Rows": [total_rows] * len(names),
            "Null_Count": null_counts,
            "Fill_Rate": fill_rates,
            "Unique_Values": unique_counts,
            "Sample_Value": sample_values
        })
        
        self.log(f"Successfully generated field info for {len(names)} fields.")
        return metadata_df
