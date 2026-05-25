import polars as pl
from typing import Dict, Any, List

class SchemaCompatibilityError(ValueError):
    """Raised when a node receives an upstream schema that lacks required columns."""
    pass

class BaseNode:
    MANIFEST: Dict[str, Any] = {}
    
    def __init__(self, node_id: str, parameters: Dict[str, Any]):
        self.node_id = node_id
        self.parameters = parameters
        self.logs: List[str] = []

    def log(self, message: str):
        self.logs.append(message)

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        """
        Executes node logic.
        inputs: dict mapping input port name (e.g. 'input') to the upstream Polars DataFrame.
        Returns: the output Polars DataFrame.
        """
        raise NotImplementedError("Each node must implement its own execute method.")
