import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class BrowseNode(BaseNode):
    MANIFEST = {
        "id": "browse",
        "name": "Browse",
        "category": "inout",
        "icon": "Search",
        "description": "View and browse full dataset profile.",
        "ui_schema": [
            {"field": "info", "type": "display_only", "label": "Information", "default": "View Data in Results Panel"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Browse node requires an incoming data stream.")
        self.log(f"Browse node received dataframe: {df.height} rows, {df.width} columns.")
        return df
