import polars as pl
from typing import Dict, Any
import io
import pandas as pd
from app.tools.base import BaseNode
from app.utils.semantic_profiler import profile_and_cast_df

class TextInputNode(BaseNode):
    MANIFEST = {
        "id": "textInput",
        "name": "Text Input",
        "category": "inout",
        "icon": "Type",
        "description": "Paste tabular data directly into the workflow (e.g., copied from an Excel spreadsheet or a Browse tool grid). This data will be parsed into a dataframe.",
        "ui_schema": [
            {"field": "textContent", "type": "textarea", "label": "Paste Tabular Data Here", "default": ""},
            {"field": "delimiter", "type": "text", "label": "Delimiter (Use \\t for Tab, , for CSV)", "default": "\\t"},
            {"field": "has_header", "type": "boolean", "label": "First row contains column headers", "default": True}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        text_content = self.parameters.get("textContent", "")
        if not text_content or not text_content.strip():
            self.log("Text input is empty.")
            return pl.DataFrame()
            
        delimiter = self.parameters.get("delimiter", "\t")
        has_header = self.parameters.get("has_header", True)
        
        # If user cleared the delimiter, default to tab
        if not delimiter:
            delimiter = "\t"
            
        self.log(f"Parsing text input with delimiter: {repr(delimiter)}")
        
        try:
            # Use pandas for robust parsing of clipboard data
            df_pd = pd.read_csv(
                io.StringIO(text_content.strip()),
                sep=delimiter,
                header=0 if has_header else None,
                engine="python"
            )
            
            # Ensure column names are strings
            if not has_header:
                df_pd.columns = [f"Field_{i+1}" for i in range(len(df_pd.columns))]
            else:
                df_pd.columns = [str(c).strip() for c in df_pd.columns]
                
            df = pl.from_pandas(df_pd)
            
            self.log("Running Semantic Data Profiler on parsed text...")
            final_df, semantic_meta = profile_and_cast_df(df)
            if semantic_meta:
                self.log(f"Detected semantic types: {semantic_meta}")
            
            self.log(f"Successfully parsed text input. Row count: {final_df.height}, Column count: {final_df.width}")
            return final_df
        except Exception as e:
            self.log(f"Error parsing text input: {e}")
            raise ValueError(f"Could not parse text input: {e}")
