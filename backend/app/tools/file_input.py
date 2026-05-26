import os
import polars as pl
import pdfplumber
import pandas as pd
from typing import Dict, Any, Callable
from app.tools.base import BaseNode

class FileInputNode(BaseNode):
    """
    FileInputNode ingests data from local files.
    
    COMMUNITY EXTENSIBILITY GUIDE:
    To add support for a new file type (e.g., JSON, Parquet):
    1. Create a new method (e.g., `_parse_json(self, file_path: str) -> pl.DataFrame`).
    2. Register the extension mapping inside `_get_parser_registry()`.
    """
    
    MANIFEST = {
        "id": "fileInput",
        "name": "File Input",
        "category": "inout",
        "icon": "Database",
        "description": "Read data from local CSV, Excel, PDF, or Image files.",
        "ui_schema": [
            {"field": "filePath", "type": "string", "label": "File Path / Name", "default": ""},
            {"field": "fileType", "type": "select", "label": "File Type", "options": ["auto", "csv", "excel", "pdf", "image", "parquet", "json"], "default": "auto"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        file_path = self.parameters.get("filePath", "")
        file_type = self.parameters.get("fileType", "auto").lower()
        
        # If the file path is a relative path or just a filename, assume it is in the uploads directory
        if file_path and not os.path.isabs(file_path):
            file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", file_path))

        self.log(f"Starting file read for path: {file_path}")
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Resolve file type mapping
        registry = self._get_parser_registry()
        
        if file_type == "auto":
            ext = os.path.splitext(file_path)[1].lower()
            file_type = self._resolve_auto_type(ext, registry)
            self.log(f"Auto-detected file type: {file_type}")

        if file_type not in registry:
            raise ValueError(f"Unsupported file type: {file_type}. Supported types: {list(registry.keys())}")

        # Execute parser
        parser_func = registry[file_type]
        return parser_func(file_path)

    def _get_parser_registry(self) -> Dict[str, Callable[[str], pl.DataFrame]]:
        """Registry mapping file type identifiers to their parsing strategies."""
        return {
            "csv": self._parse_csv,
            "excel": self._parse_excel,
            "pdf": self._parse_pdf,
            "image": self._parse_image,
            "parquet": self._parse_parquet,
            "json": self._parse_json
        }

    def _resolve_auto_type(self, ext: str, registry: dict) -> str:
        """Map file extensions to registered parser types."""
        if ext == ".csv": return "csv"
        if ext in [".xls", ".xlsx", ".xlsm", ".xlsb", ".ods"]: return "excel"
        if ext == ".pdf": return "pdf"
        if ext in [".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp"]: return "image"
        if ext == ".parquet": return "parquet"
        if ext == ".json": return "json"
        return "csv" # Fallback

    def _parse_parquet(self, file_path: str) -> pl.DataFrame:
        self.log(f"Parsing Parquet file...")
        df = pl.read_parquet(file_path)
        self.log(f"Successfully read Parquet. Row count: {df.height}, Column count: {df.width}")
        return df

    def _parse_json(self, file_path: str) -> pl.DataFrame:
        self.log(f"Parsing JSON file...")
        df = pl.read_json(file_path)
        self.log(f"Successfully read JSON. Row count: {df.height}, Column count: {df.width}")
        return df

    def _parse_csv(self, file_path: str) -> pl.DataFrame:
        delimiter = self.parameters.get("csvDelimiter", ",")
        has_header = self.parameters.get("csvHeader", True)
        encoding = self.parameters.get("csvEncoding", "utf-8")
        
        self.log(f"Parsing CSV with delimiter='{delimiter}', encoding='{encoding}', header={has_header}")
        df = pl.read_csv(
            file_path,
            separator=delimiter,
            has_header=has_header,
            encoding=encoding,
            infer_schema_length=10000,
            null_values=["", "NA", "NaN", "null"],
            try_parse_dates=True
        )
        self.log(f"Successfully read CSV. Row count: {df.height}, Column count: {df.width}")
        return df

    def _parse_excel(self, file_path: str) -> pl.DataFrame:
        sheet_name = self.parameters.get("excelSheet", "")
        self.log(f"Parsing Excel file. Sheet: '{sheet_name if sheet_name else 'First Sheet'}'")
        
        if sheet_name:
            df = pl.read_excel(file_path, sheet_name=sheet_name, engine="calamine")
        else:
            df = pl.read_excel(file_path, engine="calamine")
            
        self.log(f"Successfully read Excel. Row count: {df.height}, Column count: {df.width}")
        return df

    def _parse_pdf(self, file_path: str) -> pl.DataFrame:
        extraction_mode = self.parameters.get("pdfExtractionMode", "text").lower()
        self.log(f"Parsing PDF using mode: '{extraction_mode}' via pdfplumber...")
        tables_data = []
        headers = None
        
        if extraction_mode == "tables":
            with pdfplumber.open(file_path) as pdf:
                self.log(f"PDF contains {len(pdf.pages)} pages")
                for i, page in enumerate(pdf.pages):
                    page_tables = page.extract_tables()
                    if page_tables:
                        self.log(f"Page {i+1}: extracted {len(page_tables)} table(s)")
                    
                    for table in page_tables:
                        if not table: continue
                        
                        start_row = 0
                        if not headers:
                            raw_headers = table[0]
                            headers = [str(h).strip() if h and str(h).strip() else f"Column_{idx}" for idx, h in enumerate(raw_headers)]
                            start_row = 1
                            self.log(f"Detected columns from PDF table: {headers}")

                        for row in table[start_row:]:
                            cleaned_row = [str(val).strip() if val is not None else "" for val in row[:len(headers)]]
                            if len(cleaned_row) < len(headers):
                                cleaned_row.extend([""] * (len(headers) - len(cleaned_row)))
                            tables_data.append(cleaned_row)

        if not tables_data:
            if extraction_mode == "tables":
                self.log("No tables found in PDF. Falling back to line text extraction...")
            
            with pdfplumber.open(file_path) as pdf:
                text_lines = []
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_lines.extend(text.splitlines())
            
            if text_lines:
                headers = ["Text_Line"]
                tables_data = [[line.strip()] for line in text_lines if line.strip()]
                self.log(f"Extracted {len(tables_data)} text lines as a single column.")
            else:
                raise ValueError("No text or tables could be extracted from this PDF.")

        pdf_pd = pd.DataFrame(tables_data, columns=headers)
        df = pl.from_pandas(pdf_pd)
        
        self.log(f"Successfully read PDF. Row count: {df.height}, Column count: {df.width}")
        return df

    def _parse_image(self, file_path: str) -> pl.DataFrame:
        self.log("Parsing Image text using pytesseract OCR...")
        try:
            import pytesseract
            from PIL import Image
        except ImportError:
            err_msg = "pytesseract or Pillow is not installed. Please run: pip install pytesseract pillow"
            self.log(err_msg)
            raise ImportError(err_msg)

        try:
            img = Image.open(file_path)
            text = pytesseract.image_to_string(img)
        except Exception as e:
            err_msg = f"OCR failed. Please ensure Tesseract-OCR is installed. Error: {str(e)}"
            self.log(err_msg)
            raise RuntimeError(err_msg)

        text_lines = [line.strip() for line in text.splitlines() if line.strip()] if text else []
        
        if not text_lines:
            self.log("No text could be extracted from the image.")
            df = pl.DataFrame({"Text_Line": []}, schema={"Text_Line": pl.String})
        else:
            df = pl.DataFrame({"Text_Line": text_lines})
            
        self.log(f"Successfully read Image OCR. Row count: {df.height}, Column count: {df.width}")
        return df
