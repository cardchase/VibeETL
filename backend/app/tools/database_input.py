import polars as pl
import time
from app.tools.base import BaseNode

def verify_safe_sql_query(query_str: str) -> None:
    """
    Validates a SQL query string to block destructive statements and chaining.
    """
    import re
    from app.tools.base import SecurityError
    
    # Strip out string literals (single and double quotes) to avoid false positives
    stripped_query = re.sub(r"'.*?'", "", query_str, flags=re.DOTALL)
    stripped_query = re.sub(r'".*?"', "", stripped_query, flags=re.DOTALL)
    
    # Check for chaining
    if ';' in stripped_query:
        raise SecurityError("SQL injection blocked: Statement chaining (semicolon) is not permitted.")
        
    # Check for destructive keywords
    destructive_keywords = {'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'UPDATE', 'INSERT', 'GRANT', 'REVOKE'}
    
    # Tokenize the stripped query to match whole words only
    tokens = set(re.findall(r'\b\w+\b', stripped_query.upper()))
    
    for kw in destructive_keywords:
        if kw in tokens:
            raise SecurityError(f"Destructive SQL operation blocked: '{kw}' keyword is not permitted in read-only nodes.")

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
            # Run the security verification sweep before passing to the engine
            verify_safe_sql_query(query)
            
            # Polars native read_database_uri uses connectorx or adbc under the hood for massive speed
            df = pl.read_database_uri(query=query, uri=db_uri)
            
            elapsed = time.time() - start_time
            self.log(f"Successfully read {df.height} rows and {df.width} columns in {elapsed:.2f} seconds.")
            return df
        except Exception as e:
            from app.tools.base import SecurityError
            if isinstance(e, SecurityError):
                self.log(f"Security Intervention: {str(e)}")
            else:
                self.log(f"Database Error: {str(e)}")
            raise ValueError(f"Failed to read from database: {str(e)}")
