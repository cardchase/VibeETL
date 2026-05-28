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
        "description": "Write data to local CSV, Excel, Parquet, JSON, or HTML.",
        "ui_schema": [
            {"field": "saveFile", "type": "boolean", "label": "Write to Disk", "default": False},
            {"field": "outputPath", "type": "string", "label": "Output Path / File Name", "default": "output.csv"},
            {"field": "outputFormat", "type": "select", "label": "Output Format", "options": ["csv", "excel", "parquet", "json", "html"], "default": "csv"},
            {"field": "sheetName", "type": "string", "label": "Sheet Name (Excel Only)", "default": "Sheet1"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Awaiting connection: FileOutput node requires an incoming data stream.")
            
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
            "csv": self._write_csv,
            "excel": self._write_excel,
            "parquet": self._write_parquet,
            "json": self._write_json,
            "html": self._write_html_payload
        }

    def _write_csv(self, df: pl.DataFrame, file_path: str) -> None:
        if "__vibe_html_payload__" in df.columns:
            raise ValueError("Attempted to write an HTML payload as a CSV. Please change the Output Format to HTML.")
        self.log(f"Writing CSV file to {file_path}")
        df.write_csv(file_path)
        
    def _write_excel(self, df: pl.DataFrame, file_path: str) -> None:
        if "__vibe_html_payload__" in df.columns:
            raise ValueError("Attempted to write an HTML payload as an Excel file. Please change the Output Format to HTML.")
        
        sheet_name = self.parameters.get("sheetName", "Sheet1")
        self.log(f"Writing Excel file to {file_path} (Sheet: {sheet_name})")
        
        # If file exists, we try to append/replace the sheet using pandas and openpyxl
        if os.path.exists(file_path):
            try:
                import pandas as pd
                self.log(f"File exists. Appending to existing workbook.")
                pandas_df = df.to_pandas()
                with pd.ExcelWriter(file_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                    pandas_df.to_excel(writer, sheet_name=sheet_name, index=False)
                return
            except Exception as e:
                self.log(f"Warning: Could not append to existing Excel file ({e}). Overwriting instead.")
        
        # Default behavior: overwrite the file using polars native writer
        df.write_excel(file_path, worksheet=sheet_name)

    def _write_parquet(self, df: pl.DataFrame, file_path: str) -> None:
        if "__vibe_html_payload__" in df.columns:
            raise ValueError("Attempted to write an HTML payload as a Parquet file. Please change the Output Format to HTML.")
        self.log(f"Writing Parquet file to {file_path}")
        df.write_parquet(file_path)

    def _write_json(self, df: pl.DataFrame, file_path: str) -> None:
        if "__vibe_html_payload__" in df.columns:
            raise ValueError("Attempted to write an HTML payload as a JSON file. Please change the Output Format to HTML.")
        self.log(f"Writing JSON file to {file_path}")
        df.write_json(file_path)

    def _write_html_payload(self, df: pl.DataFrame, file_path: str) -> None:
        if "__vibe_html_payload__" not in df.columns:
            raise ValueError("Output Format is set to HTML, but upstream node did not provide an HTML payload.")
            
        self.log(f"Writing HTML payload to {file_path}")
        
        html_str = df["__vibe_html_payload__"][0]
        if not html_str:
            raise ValueError("HTML payload was empty.")
            
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html_str)
