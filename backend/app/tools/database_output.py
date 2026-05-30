import polars as pl
import time
import re
from typing import Dict
from app.tools.base import BaseNode, SecurityError

def verify_safe_table_destination(table_name: str) -> None:
    """
    Validates destination database identifiers against truncation hacks, 
    special character SQL escapes, and core operational system catalog updates.
    """
    if not table_name:
        raise ValueError("Target database table name configuration string is empty.")
        
    # Enforce strict alphanumeric table name structures to block malicious syntax escaping
    if not re.match(r"^[a-zA-Z0-9___]+$", table_name):
        raise SecurityError(
            f"Security Intercept: Invalid syntax structures detected in target table name '{table_name}'. "
            "Table identifiers must strictly consist of alphanumeric characters or underscores."
        )
        
    # Guard internal operational database system catalogs from destructive overwrites
    restricted_catalogs = {"pg_stat", "information_schema", "sqlite_master", "mysql", "sys", "vibe_workspace"}
    if table_name.lower() in restricted_catalogs or any(table_name.lower().startswith(r) for r in restricted_catalogs):
        raise SecurityError(
            f"Security Intercept: Target destination identifier '{table_name}' matches a restricted system directory. "
            "Writing data records directly to internal infrastructure configuration catalogs is strictly prohibited."
        )

class DatabaseOutputExecutor(BaseNode):
    """
    Connects to an SQL Database and writes Polars data frames natively.
    Hardened with schema destination validation boundaries and structured exception logs.
    """

    MANIFEST = {
        "id": "databaseOutput",
        "name": "DB-Out",
        "description": "Write pipeline datasets safely to external SQL Databases (PostgreSQL, MySQL, SQLite) natively.",
        "icon": "Database",
        "category": "inout",
        "ui_schema": [
            {
                "field": "db_uri",
                "label": "Connection String (URI)",
                "type": "text",
                "default": "sqlite:///./vibe_workspace.db",
                "placeholder": "postgresql://user:pass@host:5432/dbname"
            },
            {
                "field": "table_name",
                "label": "Table Name",
                "type": "text",
                "default": "processed_output_records",
                "placeholder": "output_table_name"
            },
            {
                "field": "if_exists",
                "label": "If Table Exists",
                "type": "select",
                "options": ["append", "fail", "replace_warning"],
                "default": "append"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Awaiting connection: Database Output node requires an incoming data stream.")
            
        df = inputs["input"]
        db_uri = self.parameters.get("db_uri", "").strip()
        table_name = self.parameters.get("table_name", "").strip()
        if_exists = self.parameters.get("if_exists", "append").lower()

        if not db_uri:
            raise ValueError("Database Connection String (URI) parameter configuration is missing.")

        # Sanitize sensitive access credentials out of the server runtime logs
        safe_log_uri = db_uri.split("@")[-1] if "@" in db_uri else db_uri
        self.log(f"Initializing output target stream pipeline connection to database: {safe_log_uri}")

        try:
            # 1. Run strict destination identifier sanitization sweeps
            verify_safe_table_destination(table_name)
            
            # 2. Intercept and isolate high-risk destructive drop operations
            if if_exists == "replace_warning":
                self.log(f"⚠️ High-Risk Action: Destination write mode set to OVERWRITE for table '{table_name}'. "
                         f"Purging old schema blocks.")
                actual_write_mode = "replace"
            else:
                actual_write_mode = if_exists

            self.log(f"Commencing binary database commit into table '{table_name}' (Mode: {actual_write_mode})...")
            start_time = time.time()
            
            # Fire native multi-threaded Polars database compilation engine
            df.write_database(
                table_name=table_name,
                connection=db_uri,
                if_table_exists=actual_write_mode
            )
            
            elapsed = time.time() - start_time
            self.log(f"🟢 Success: Successfully committed {df.height:,} records to database table '{table_name}' "
                     f"in {elapsed:.2f} seconds.")
            return df
            
        except SecurityError as se:
            err_msg = f"❌ Security Intercept: {str(se)}"
            self.log(err_msg)
            raise ValueError(err_msg)
            
        except Exception as e:
            err_msg = f"Database Transaction Aborted: {str(e)}"
            self.log(err_msg)
            raise ValueError(err_msg)
