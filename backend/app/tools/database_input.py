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
                "field": "connection_mode",
                "label": "Connection Mode",
                "type": "select",
                "options": ["Raw Connection String", "Credentials Builder"],
                "default": "Raw Connection String"
            },
            {
                "field": "db_uri",
                "label": "Raw Connection String",
                "type": "text",
                "default": "",
                "placeholder": "sqlite:///./test.db OR postgresql://user:pass@host/db"
            },
            {
                "field": "db_dialect",
                "label": "Database Type (Builder)",
                "type": "select",
                "options": ["PostgreSQL", "MySQL", "Microsoft SQL Server", "SQLite (Local File)", "Oracle", "Microsoft Access (Local File)"],
                "default": "PostgreSQL"
            },
            {
                "field": "db_host",
                "label": "Host or File Path (Builder)",
                "type": "text",
                "default": "",
                "placeholder": "e.g., localhost or C:\\path\\to\\db.sqlite"
            },
            {
                "field": "db_port",
                "label": "Port (Builder)",
                "type": "text",
                "default": "",
                "placeholder": "e.g., 5432"
            },
            {
                "field": "db_name",
                "label": "Database Name (Builder)",
                "type": "text",
                "default": "",
                "placeholder": "e.g., my_database"
            },
            {
                "field": "db_user",
                "label": "Username (Builder)",
                "type": "text",
                "default": ""
            },
            {
                "field": "db_password",
                "label": "Password (Builder)",
                "type": "password",
                "default": ""
            },
            {
                "field": "query",
                "label": "SQL Query",
                "type": "textarea",
                "default": "SELECT * FROM my_table LIMIT 10000",
                "placeholder": "SELECT * FROM..."
            }
        ]
    }

    def execute(self, inputs: dict) -> pl.DataFrame:
        mode = self.parameters.get("connection_mode", "Raw Connection String")
        
        if mode == "Credentials Builder":
            dialect = self.parameters.get("db_dialect", "PostgreSQL")
            host = self.parameters.get("db_host", "").strip()
            port = self.parameters.get("db_port", "").strip()
            db_name = self.parameters.get("db_name", "").strip()
            user = self.parameters.get("db_user", "").strip()
            pwd = self.parameters.get("db_password", "").strip()

            if not host:
                raise ValueError("Host or File Path is required in Credentials Builder mode.")

            prefix_map = {
                "PostgreSQL": "postgresql",
                "MySQL": "mysql",
                "Microsoft SQL Server": "mssql+pyodbc",
                "SQLite (Local File)": "sqlite",
                "Oracle": "oracle",
                "Microsoft Access (Local File)": "access"
            }
            prefix = prefix_map.get(dialect, "postgresql")

            if prefix == "sqlite":
                safe_path = host.replace("\\", "/")
                db_uri = f"sqlite:///{safe_path}"
            elif prefix == "access":
                db_uri = f"access:///{host}"
            else:
                auth = ""
                if user or pwd:
                    # properly format auth even if no password
                    auth = f"{user}:{pwd}@"
                port_str = f":{port}" if port else ""
                db_uri = f"{prefix}://{auth}{host}{port_str}/{db_name}"
        else:
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
            # Auto-format raw file paths to SQLite URIs for convenience
            if db_uri.endswith(".db") or db_uri.endswith(".sqlite"):
                if not db_uri.startswith("sqlite"):
                    # Convert backslashes to forward slashes for SQLAlchemy/ADBC
                    safe_path = db_uri.replace("\\", "/")
                    db_uri = f"sqlite:///{safe_path}"
                    
            if db_uri.startswith("access:///") or db_uri.endswith(".mdb") or db_uri.endswith(".accdb"):
                # Handle MS Access separately since polars read_database doesn't support it natively
                import os
                
                # Extract file path
                if db_uri.startswith("access:///"):
                    file_path = db_uri[10:]
                elif db_uri.startswith("access://"):
                    file_path = db_uri[9:]
                else:
                    file_path = db_uri
                    
                df = self._parse_access(file_path, query)
                elapsed = time.time() - start_time
                self.log(f"Successfully read {df.height} rows and {df.width} columns in {elapsed:.2f} seconds.")
                return df

            # Run the security verification sweep before passing to the engine
            verify_safe_sql_query(query)
            
            # Polars native read_database_uri uses connectorx or adbc under the hood for massive speed
            # Use ADBC for SQLite to prevent Windows path parsing issues in connectorx
            if db_uri.startswith("sqlite"):
                df = pl.read_database_uri(query=query, uri=db_uri, engine="adbc")
            else:
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

    def _parse_access(self, file_path: str, query: str) -> pl.DataFrame:
        self.log(f"Parsing MS Access Database: {file_path}")
        import os
        try:
            import pyodbc
        except ImportError:
            self.log("pyodbc is missing. Attempting dynamic install...")
            import subprocess
            import sys
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "pyodbc"], stdout=subprocess.DEVNULL)
                import pyodbc
            except Exception as e:
                raise RuntimeError(f"Could not install pyodbc. Please install it manually: {e}")

        # Check if Microsoft Access Driver is available
        drivers = pyodbc.drivers()
        access_driver = None
        for driver in drivers:
            if "Microsoft Access Driver" in driver and "(*.mdb, *.accdb)" in driver:
                access_driver = driver
                break

        if not access_driver:
            err_msg = (
                "Microsoft Access ODBC driver not found on this system. "
                "Please download and install the 'Microsoft Access Database Engine 2016 Redistributable' "
                "(or newer) from Microsoft's website. "
                f"Available ODBC drivers: {drivers}"
            )
            self.log(err_msg)
            raise RuntimeError(err_msg)

        conn_str = f"Driver={{{access_driver}}};DBQ={os.path.abspath(file_path)};"
        try:
            conn = pyodbc.connect(conn_str)
            cursor = conn.cursor()
            
            self.log(f"Executing query: {query}")
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [column[0] for column in cursor.description]
            
            if not rows:
                return pl.DataFrame({c: [] for c in columns})
                
            data = [dict(zip(columns, row)) for row in rows]
            df = pl.DataFrame(data)
            return df
            
        except Exception as e:
            self.log(f"Error reading Access database: {str(e)}")
            raise RuntimeError(f"MS Access Error: {str(e)}")
