import polars as pl
from typing import Dict
from app.tools.base import BaseNode

class SamplingNode(BaseNode):
    MANIFEST = {
        "id": "sampling",
        "name": "Sample Records",
        "category": "prep",
        "icon": "TestTubes",
        "description": "Extract a subset of records (First N, Last N, or Random).",
        "ui_schema": [
            {
                "field": "sample_type",
                "type": "select",
                "label": "Sample Method",
                "default": "first",
                "options": ["first", "last", "random"]
            },
            {
                "field": "n_records",
                "type": "number",
                "label": "Number of Records (N)",
                "default": 100
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        sample_type = self.parameters.get("sample_type", "first")
        n_records = int(self.parameters.get("n_records", 100))

        if n_records <= 0:
            return df.head(0)

        # Cap N to the length of the dataframe to avoid errors
        n_records = min(n_records, len(df))

        if sample_type == "first":
            self.log(f"Extracting first {n_records} records.")
            return df.head(n_records)
        elif sample_type == "last":
            self.log(f"Extracting last {n_records} records.")
            return df.tail(n_records)
        elif sample_type == "random":
            self.log(f"Extracting random sample of {n_records} records.")
            return df.sample(n=n_records)
        
        return df
