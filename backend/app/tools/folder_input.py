import os
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class FolderInputNode(BaseNode):
    MANIFEST = {
        "id": "folderInput",
        "name": "Folder Input",
        "category": "inout",
        "icon": "FolderOpen",
        "description": "Scans a local directory and outputs a dataset of all files. Useful for batch processing.",
        "ui_schema": [
            {"field": "folderPath", "type": "string", "label": "Folder Path", "default": ""},
            {"field": "extensions", "type": "string", "label": "Allowed Extensions (comma-separated)", "default": "*"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        folder_path = self.parameters.get("folderPath", "").strip()
        extensions_raw = self.parameters.get("extensions", "*").strip()
        
        if not folder_path:
            self.log("Waiting for folder configuration...")
            return pl.DataFrame({
                "FilePath": pl.Series(dtype=pl.Utf8),
                "FileName": pl.Series(dtype=pl.Utf8),
                "Extension": pl.Series(dtype=pl.Utf8),
                "Size": pl.Series(dtype=pl.Int64)
            })

        # Resolve path
        if not os.path.isabs(folder_path):
            folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", folder_path))

        if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
            raise ValueError(f"Directory not found: {folder_path}")

        # Parse extensions
        allowed_exts = []
        if extensions_raw and extensions_raw != "*":
            allowed_exts = [ext.strip().lower() for ext in extensions_raw.split(",")]
            # ensure they start with dot
            allowed_exts = [ext if ext.startswith(".") else f".{ext}" for ext in allowed_exts]

        results = []
        
        self.log(f"Scanning directory: {folder_path}")
        
        for root, _, files in os.walk(folder_path):
            # Only top-level for now
            if root != folder_path:
                continue
                
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                
                if allowed_exts and ext not in allowed_exts:
                    continue
                    
                file_path = os.path.join(root, file)
                
                try:
                    size = os.path.getsize(file_path)
                except Exception:
                    size = 0
                    
                results.append({
                    "FilePath": file_path,
                    "FileName": file,
                    "Extension": ext,
                    "Size": size
                })

        self.log(f"Found {len(results)} matching files.")
        
        if not results:
            self.log("No files found matching criteria.")
            return pl.DataFrame({
                "FilePath": pl.Series(dtype=pl.Utf8),
                "FileName": pl.Series(dtype=pl.Utf8),
                "Extension": pl.Series(dtype=pl.Utf8),
                "Size": pl.Series(dtype=pl.Int64)
            })
            
        return pl.DataFrame(results)
