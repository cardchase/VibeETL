import polars as pl
import time
from app.tools.base import BaseNode

class DatabaseInputExecutor(BaseNode):
    """
    Connects to an SQL Database and reads data via a query.
    Powered by connectorx for high-performance zero-copy Arrow memory transfer.
    """

    MANIFEST = {
        "id": "databaseInput",
        "name": "DB-In",
        "description": "Read Big Data from SQL Databases (PostgreSQL, MySQL, SQLite) using high-speed Polars connectors.",
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
                "field": "query",
                "label": "SQL Query",
                "type": "textarea",
                "default": "SELECT * FROM my_table LIMIT 1000",
                "placeholder": "SELECT * FROM..."
            }
        ]
    }

    def execute(self, inputs: dict) -> pl.DataFrame:
        db_uri = self.parameters.get("db_uri", "").strip()
        query = self.parameters.get("query", "").strip()

        if not db_uri:
            raise ValueError("Database Connection String (URI) is required.")
        if not query:
            raise ValueError("SQL Query is required.")

        self.log(f"Connecting to database: {db_uri.split('@')[-1] if '@' in db_uri else db_uri}")
        self.log(f"Executing query:\n{query}")

        start_time = time.time()
        
        try:
            # Polars native read_database_uri uses connectorx or adbc under the hood for massive speed
            df = pl.read_database_uri(query=query, uri=db_uri)
            
            elapsed = time.time() - start_time
            self.log(f"Successfully read {df.height} rows and {df.width} columns in {elapsed:.2f} seconds.")
            return df
        except Exception as e:
            self.log(f"Database Error: {str(e)}")
            raise RuntimeError(f"Failed to read from database: {str(e)}")
