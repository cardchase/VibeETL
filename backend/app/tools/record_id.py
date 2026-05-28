import polars as pl
from typing import Dict
from app.tools.base import BaseNode

class RecordIDNode(BaseNode):
    MANIFEST = {
        "id": "record_id",
        "name": "Record ID",
        "category": "prep",
        "icon": "Hash",
        "description": "Add an auto-incrementing Record ID column to the data.",
        "ui_schema": [
            {
                "field": "column_name",
                "type": "string",
                "label": "Column Name",
                "default": "RecordID"
            },
            {
                "field": "starting_value",
                "type": "number",
                "label": "Starting Value",
                "default": 1
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Awaiting connection: RecordId node requires an incoming data stream.")

        df = inputs["input"]
        column_name = self.parameters.get("column_name", "RecordID")
        starting_value = self.parameters.get("starting_value", 1)
        
        try:
            starting_value = int(starting_value)
        except (ValueError, TypeError):
            starting_value = 1
            
        if not column_name:
            column_name = "RecordID"

        self.log(f"Adding Record ID column '{column_name}' starting at {starting_value}")

        # Polars has pl.int_range for generating sequences
        df_with_id = df.with_columns(
            (pl.int_range(starting_value, starting_value + df.height, dtype=pl.Int64)).alias(column_name)
        )
        
        # Reorder to put the ID column first
        cols = [column_name] + [c for c in df.columns if c != column_name]
        return df_with_id.select(cols)
