import polars as pl
import time
import re
import uuid
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

def verify_safe_columns(columns_str: str) -> None:
    """Sanitize primary keys to block SQL injection inside column identifiers."""
    if not columns_str:
        return
    cols = [c.strip() for c in columns_str.split(",") if c.strip()]
    for col in cols:
        if not re.match(r"^[a-zA-Z0-9___]+$", col):
            raise SecurityError(
                f"Security Intercept: Invalid syntax detected in primary key column '{col}'. "
                "Column identifiers must strictly consist of alphanumeric characters or underscores."
            )

class DatabaseOutputExecutor(BaseNode):
    """
    Connects to an SQL Database and writes Polars data frames natively.
    Hardened with schema destination validation boundaries and structured exception logs.
    Includes advanced Alteryx-style write modes (Delete, Update, Upsert).
    """

    MANIFEST = {
        "id": "databaseOutput",
        "name": "DB-Out",
        "description": "Write pipeline datasets safely to external SQL Databases (PostgreSQL, MySQL, SQLite) with advanced write modes.",
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
                "options": ["PostgreSQL", "MySQL", "Microsoft SQL Server", "SQLite (Local File)", "Oracle"],
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
                "field": "table_name",
                "label": "Table Name",
                "type": "text",
                "default": "processed_output_records",
                "placeholder": "output_table_name"
            },
            {
                "field": "write_mode",
                "label": "Write Mode",
                "type": "select",
                "options": [
                    "Create New Table (Fail if exists)",
                    "Append Existing",
                    "Overwrite Table (Drop)",
                    "Overwrite Data (Delete)",
                    "Update; Warn on Update Failure",
                    "Update; Insert if New (Upsert)"
                ],
                "default": "Append Existing"
            },
            {
                "field": "primary_keys",
                "label": "Primary Key(s) (comma-separated, for Update/Upsert)",
                "type": "text",
                "default": "",
                "placeholder": "e.g., id, email"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Awaiting connection: Database Output node requires an incoming data stream.")
            
        df = inputs["input"]
        
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
                "Oracle": "oracle"
            }
            prefix = prefix_map.get(dialect, "postgresql")

            if prefix == "sqlite":
                safe_path = host.replace("\\", "/")
                db_uri = f"sqlite:///{safe_path}"
            else:
                auth = ""
                if user or pwd:
                    auth = f"{user}:{pwd}@"
                port_str = f":{port}" if port else ""
                db_uri = f"{prefix}://{auth}{host}{port_str}/{db_name}"
        else:
            db_uri = self.parameters.get("db_uri", "").strip()

        table_name = self.parameters.get("table_name", "").strip()
        write_mode = self.parameters.get("write_mode", "Append Existing")
        primary_keys = self.parameters.get("primary_keys", "").strip()

        if not db_uri:
            raise ValueError("Database Connection String (URI) parameter configuration is missing.")

        # Sanitize sensitive access credentials out of the server runtime logs
        safe_log_uri = db_uri.split("@")[-1] if "@" in db_uri else db_uri
        self.log(f"Initializing output target stream pipeline connection to database: {safe_log_uri}")

        try:
            # 1. Run strict destination identifier sanitization sweeps
            verify_safe_table_destination(table_name)
            verify_safe_columns(primary_keys)
            
            # Map native Polars modes
            native_mode_map = {
                "Create New Table (Fail if exists)": "fail",
                "Append Existing": "append",
                "Overwrite Table (Drop)": "replace"
            }

            self.log(f"Commencing binary database commit into table '{table_name}' (Mode: {write_mode})...")
            start_time = time.time()
            
            if write_mode in native_mode_map:
                if write_mode == "Overwrite Table (Drop)":
                    self.log(f"⚠️ High-Risk Action: Purging old schema blocks for table '{table_name}'.")
                
                df.write_database(
                    table_name=table_name,
                    connection=db_uri,
                    if_table_exists=native_mode_map[write_mode]
                )
            else:
                # Advanced SQLAlchemy Execution Modes
                from sqlalchemy import create_engine, text
                engine = create_engine(db_uri)
                
                if write_mode == "Overwrite Data (Delete)":
                    self.log(f"⚠️ High-Risk Action: Deleting existing data from table '{table_name}' while keeping schema.")
                    with engine.begin() as conn:
                        conn.execute(text(f"DELETE FROM {table_name}"))
                    
                    df.write_database(
                        table_name=table_name,
                        connection=db_uri,
                        if_table_exists="append"
                    )
                
                elif write_mode in ("Update; Warn on Update Failure", "Update; Insert if New (Upsert)"):
                    pk_list = [k.strip() for k in primary_keys.split(",") if k.strip()]
                    if not pk_list:
                        raise ValueError(f"Primary Key(s) configuration is mandatory for mode: '{write_mode}'.")
                        
                    cols = [c for c in df.columns]
                    missing_pks = [pk for pk in pk_list if pk not in cols]
                    if missing_pks:
                        raise ValueError(f"Primary keys {missing_pks} not found in the incoming dataset.")
                        
                    staging_table = f"vibe_stage_{uuid.uuid4().hex[:8]}"
                    self.log(f"Deploying isolated staging table: {staging_table}")
                    
                    # Dump data to staging table
                    df.write_database(
                        table_name=staging_table,
                        connection=db_uri,
                        if_table_exists="replace"
                    )
                    
                    try:
                        with engine.begin() as conn:
                            dialect = engine.dialect.name
                            update_cols = [c for c in cols if c not in pk_list]
                            
                            if write_mode == "Update; Warn on Update Failure":
                                if not update_cols:
                                    self.log("Warning: No non-primary-key columns found. Update action will not alter any rows.")
                                else:
                                    if dialect in ('postgresql', 'sqlite'):
                                        set_clause = ", ".join([f"{c} = {staging_table}.{c}" for c in update_cols])
                                        where_clause = " AND ".join([f"{table_name}.{k} = {staging_table}.{k}" for k in pk_list])
                                        sql = f"UPDATE {table_name} SET {set_clause} FROM {staging_table} WHERE {where_clause}"
                                        conn.execute(text(sql))
                                    elif dialect == 'mysql':
                                        set_clause = ", ".join([f"{table_name}.{c} = {staging_table}.{c}" for c in update_cols])
                                        where_clause = " AND ".join([f"{table_name}.{k} = {staging_table}.{k}" for k in pk_list])
                                        sql = f"UPDATE {table_name} INNER JOIN {staging_table} ON {where_clause} SET {set_clause}"
                                        conn.execute(text(sql))
                                    else:
                                        raise ValueError(f"Dialect '{dialect}' not currently supported for native Update mode.")
                                        
                            elif write_mode == "Update; Insert if New (Upsert)":
                                cols_csv = ", ".join(cols)
                                if dialect == 'sqlite':
                                    set_clause = ", ".join([f"{c} = excluded.{c}" for c in update_cols])
                                    pk_csv = ", ".join(pk_list)
                                    sql = f"INSERT INTO {table_name} ({cols_csv}) SELECT {cols_csv} FROM {staging_table}"
                                    if set_clause:
                                        sql += f" ON CONFLICT ({pk_csv}) DO UPDATE SET {set_clause}"
                                    else:
                                        sql += f" ON CONFLICT ({pk_csv}) DO NOTHING"
                                    conn.execute(text(sql))
                                elif dialect == 'postgresql':
                                    set_clause = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
                                    pk_csv = ", ".join(pk_list)
                                    sql = f"INSERT INTO {table_name} ({cols_csv}) SELECT {cols_csv} FROM {staging_table}"
                                    if set_clause:
                                        sql += f" ON CONFLICT ({pk_csv}) DO UPDATE SET {set_clause}"
                                    else:
                                        sql += f" ON CONFLICT ({pk_csv}) DO NOTHING"
                                    conn.execute(text(sql))
                                elif dialect == 'mysql':
                                    set_clause = ", ".join([f"{c} = VALUES({c})" for c in update_cols])
                                    sql = f"INSERT INTO {table_name} ({cols_csv}) SELECT {cols_csv} FROM {staging_table}"
                                    if set_clause:
                                        sql += f" ON DUPLICATE KEY UPDATE {set_clause}"
                                    conn.execute(text(sql))
                                else:
                                    raise ValueError(f"Dialect '{dialect}' not currently supported for native Upsert mode.")
                    finally:
                        self.log(f"Purging staging infrastructure: {staging_table}")
                        with engine.begin() as conn:
                            conn.execute(text(f"DROP TABLE IF EXISTS {staging_table}"))
            
            elapsed = time.time() - start_time
            self.log(f"🟢 Success: Successfully committed {df.height:,} records to database table '{table_name}' in {elapsed:.2f} seconds.")
            return df
            
        except SecurityError as se:
            err_msg = f"❌ Security Intercept: {str(se)}"
            self.log(err_msg)
            raise ValueError(err_msg)
            
        except Exception as e:
            err_msg = f"Database Transaction Aborted: {str(e)}"
            self.log(err_msg)
            raise ValueError(err_msg)
