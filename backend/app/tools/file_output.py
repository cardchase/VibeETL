import os
import polars as pl
from typing import Dict, Any, Callable
from app.tools.base import BaseNode

class FileOutputNode(BaseNode):
    """
    FileOutputNode writes downstream dataframes to the local filesystem.
    
    COMMUNITY EXTENSIBILITY GUIDE:
    To add support for a new output format (e.g., JSON, Parquet, Word, PDF):
    1. Create a new method (e.g., `_write_json(self, df: pl.DataFrame, file_path: str)`).
    2. Register the extension mapping inside `_get_writer_registry()`.
    """
    
    MANIFEST = {
        "id": "fileOutput",
        "name": "File Output",
        "category": "inout",
        "icon": "Save",
        "description": "Write data to local CSV, PDF, or other formats.",
        "ui_schema": [
            {"field": "saveFile", "type": "boolean", "label": "Write to Disk", "default": False},
            {"field": "outputPath", "type": "string", "label": "Output Path / File Name", "default": "output.csv"},
            {"field": "outputFormat", "type": "select", "label": "Output Format", "options": ["csv"], "default": "csv"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("FileOutput node requires an input dataframe named 'input'.")
            
        df = inputs["input"]
        file_path = self.parameters.get("outputPath", "output.csv")
        output_format = self.parameters.get("outputFormat", "csv").lower()
        
        # If the file path is relative, put it in the outputs directory
        if not os.path.isabs(file_path):
            outputs_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "outputs"))
            os.makedirs(outputs_dir, exist_ok=True)
            file_path = os.path.join(outputs_dir, file_path)

        self.log(f"Starting file write for path: {file_path}")

        # Only write to disk if the user explicitly enables it, to prevent Auto-Run thrashing
        save_file = self.parameters.get("saveFile", False)
        
        if save_file:
            registry = self._get_writer_registry()

            if output_format not in registry:
                raise ValueError(f"Unsupported output format: {output_format}. Supported formats: {list(registry.keys())}")

            # Execute writer
            writer_func = registry[output_format]
            writer_func(df, file_path)
            
            self.log(f"Successfully wrote {df.height} rows and {df.width} columns to {file_path}")
        else:
            self.log(f"Disk writing is currently DISABLED. Enable 'Write to Disk' in the configuration to save to {file_path}.")
        
        # Output nodes traditionally pass the dataframe through, unmodified, so users can continue if they want
        return df

    def _get_writer_registry(self) -> Dict[str, Callable[[pl.DataFrame, str], None]]:
        """Registry mapping file type identifiers to their writing strategies."""
        return {
            "csv": self._write_csv
        }

    def _write_csv(self, df: pl.DataFrame, file_path: str) -> None:
        self.log(f"Writing CSV file to {file_path}")
        df.write_csv(file_path)
