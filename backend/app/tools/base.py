import polars as pl
from typing import Dict, Any, List

class SchemaCompatibilityError(ValueError):
    """Raised when a node receives an upstream schema that lacks required columns."""
    pass

class SecurityError(Exception):
    """Raised when an expression or script contains unauthorized or dangerous keywords/calls."""
    pass

class BaseNode:
    MANIFEST: Dict[str, Any] = {}
    
    def __init__(self, node_id: str, parameters: Dict[str, Any]):
        self.node_id = node_id
        self.parameters = parameters
        self.logs: List[str] = []

    def log(self, message: str):
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        node_name = self.MANIFEST.get("name", self.node_id)
        sid = getattr(self, "session_id", "default")
        workflow_name = getattr(self, "workflow_name", sid)
        
        print(f"[{timestamp}] [{workflow_name}] [NODE LOG - {node_name}] {message}", flush=True)
        self.logs.append(f"[{timestamp}] [{workflow_name}] [{node_name}] {message}")

    def graceful_bypass(self, df: pl.DataFrame, missing_cols: List[str], expected_config: Dict[str, str]) -> pl.DataFrame:
        """
        Enterprise-grade graceful degradation. 
        Logs a detailed warning when required columns are missing and returns the DataFrame unmodified,
        preventing hard crashes in the pipeline execution loop.
        """
        node_name = self.MANIFEST.get("name", self.node_id).upper()
        self.log(f"⚠️ {node_name} BYPASSED: Missing required configuration columns.")
        
        config_str = ", ".join([f"{k}='{v}'" for k, v in expected_config.items()])
        self.log(f"   -> Expected Configuration: {config_str}")
        self.log(f"   -> Actually Missing from Input: {missing_cols}")
        
        available_cols = list(df.columns)
        self.log(f"   -> Input Schema Provided ({len(available_cols)} columns): {available_cols[:10]}{'...' if len(available_cols) > 10 else ''}")
        self.log("   -> ACTION: Returning data unmodified. Ensure upstream Select/Filter nodes have not dropped these core columns.")
        
        return df

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        """
        Executes node logic.
        inputs: dict mapping input port name (e.g. 'input') to the upstream Polars DataFrame.
        Returns: the output Polars DataFrame.
        """
        raise NotImplementedError("Each node must implement its own execute method.")
