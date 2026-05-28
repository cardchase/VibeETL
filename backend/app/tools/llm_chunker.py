import polars as pl
from typing import Dict
from app.tools.base import BaseNode

class LLMChunkerNode(BaseNode):
    MANIFEST = {
        "id": "llm_chunker",
        "name": "LLM Chunker",
        "category": "analysis",
        "icon": "Blocks",
        "description": "Batch sequential rows of text into large prompt chunks for LLMs.",
        "ui_schema": [
            {
                "field": "chunk_size",
                "type": "number",
                "label": "Rows per Chunk",
                "default": 10
            },
            {
                "field": "columns_to_chunk",
                "type": "column_multi_select",
                "label": "Columns to Combine",
                "default": []
            },
            {
                "field": "row_separator",
                "type": "select",
                "label": "Row Separator",
                "default": "\\n",
                "options": ["\\n", "\\n\\n", ", ", " | "]
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        chunk_size = int(self.parameters.get("chunk_size", 10))
        columns_to_chunk = self.parameters.get("columns_to_chunk", [])
        row_separator = self.parameters.get("row_separator", "\n")
        
        # UI might pass actual literal "\n" string instead of newline character
        if row_separator == "\\n":
            row_separator = "\n"
        elif row_separator == "\\n\\n":
            row_separator = "\n\n"

        if not columns_to_chunk:
            self.log("No columns selected for chunking. Returning dataframe unchanged.")
            return df
            
        # Ensure selected columns exist
        available_cols = set(df.columns)
        valid_cols = [c for c in columns_to_chunk if c in available_cols]
        
        if not valid_cols:
            self.log("Selected columns do not exist in the dataframe. Returning unchanged.")
            return df

        if chunk_size <= 0:
            raise ValueError("Rows per Chunk must be greater than 0.")

        self.log(f"Chunking {len(valid_cols)} columns independently into batches of {chunk_size} rows.")

        # Step 1: Add a row number for chunking math
        df_processed = df.with_columns([
            pl.arange(0, pl.count()).alias("__row_nr__")
        ])
        
        # Step 2: Create a Chunk ID by doing integer division on the row number
        df_processed = df_processed.with_columns(
            (pl.col("__row_nr__") // chunk_size).alias("Chunk_ID")
        )
        
        # Step 3: Group by Chunk ID and independently aggregate each selected column
        aggs = [
            pl.col(c).cast(pl.String).str.join(row_separator).alias(c)
            for c in valid_cols
        ]
        aggs.append(pl.count().alias("Rows_in_Chunk"))
        
        df_chunked = df_processed.group_by("Chunk_ID", maintain_order=True).agg(aggs)
        
        self.log(f"Generated {len(df_chunked)} chunks.")
        
        return df_chunked
