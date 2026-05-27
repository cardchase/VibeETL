import polars as pl
import time
from typing import Dict
from app.tools.base import BaseNode

class DatabaseOutputExecutor(BaseNode):
    """
    Connects to an SQL Database and writes data via SQLAlchemy/adbc.
    """

    MANIFEST = {
        "id": "databaseOutput",
        "name": "DB-Out",
        "description": "Write data to SQL Databases (PostgreSQL, MySQL, SQLite) natively.",
        "icon": "Database",
        "category": "inout",
        "ui_schema": [
            {
                "field": "db_uri",
                "label": "Connection String (URI)",
                "type": "text",
                "default": "sqlite:///G:/My Drive/Projects/VibeETL/test.db",
                "placeholder": "e.g., postgresql://user:pass@host:5432/dbname"
            },
            {
                "field": "table_name",
                "label": "Table Name",
                "type": "text",
                "default": "my_new_table",
                "placeholder": "output_table"
            },
            {
                "field": "if_exists",
                "label": "If Table Exists",
                "type": "select",
                "options": ["replace", "append", "fail"],
                "default": "replace"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("DatabaseOutput node requires an input dataframe named 'input'.")
            
        df = inputs["input"]
        db_uri = self.parameters.get("db_uri", "").strip()
        table_name = self.parameters.get("table_name", "").strip()
        if_exists = self.parameters.get("if_exists", "replace").lower()

        if not db_uri:
            raise ValueError("Database Connection String (URI) is required.")
        if not table_name:
            raise ValueError("Table Name is required.")

        self.log(f"Connecting to database: {db_uri.split('@')[-1] if '@' in db_uri else db_uri}")
        self.log(f"Target table: {table_name} (Mode: {if_exists})")

        start_time = time.time()
        
        try:
            # Polars native write_database
            df.write_database(
                table_name=table_name,
                connection=db_uri,
                if_table_exists=if_exists
            )
            
            elapsed = time.time() - start_time
            self.log(f"Successfully wrote {df.height} rows and {df.width} columns in {elapsed:.2f} seconds.")
            return df
        except Exception as e:
            self.log(f"Database Error: {str(e)}")
            raise RuntimeError(f"Failed to write to database: {str(e)}")
