import threading
import polars as pl
from typing import Dict, Any, List

class PipelineCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._global_logs: List[str] = []

    def clear(self):
        with self._lock:
            self._cache.clear()
            self._global_logs.clear()

    def set_node_result(self, node_id: str, df: Any, duration_ms: float, logs: List[str]):
        with self._lock:
            import polars as pl
            if isinstance(df, dict):
                # Multi-port results mapping: port_name -> pl.DataFrame
                ports_data = {}
                for port, port_df in df.items():
                    if port_df is not None:
                        preview_df = port_df.head(100)
                        schema = [{"name": name, "type": str(dtype)} for name, dtype in port_df.schema.items()]
                        preview_rows = preview_df.to_dicts()
                        ports_data[port] = {
                            "schema": schema,
                            "preview": preview_rows,
                            "row_count": port_df.height,
                            "column_count": port_df.width,
                            "_df": port_df
                        }
                
                # Default output values derived from the primary port (e.g. "true" or the first available)
                primary_port = "true" if "true" in ports_data else (list(ports_data.keys())[0] if ports_data else None)
                primary = ports_data.get(primary_port, {}) if primary_port else {}

                self._cache[node_id] = {
                    "status": "success",
                    "schema": primary.get("schema", []),
                    "preview": primary.get("preview", []),
                    "row_count": primary.get("row_count", 0),
                    "column_count": primary.get("column_count", 0),
                    "duration_ms": duration_ms,
                    "logs": logs,
                    "error": None,
                    "ports": {p: {k: v for k, v in data.items() if k != "_df"} for p, data in ports_data.items()},
                    "_ports_df": {p: data.get("_df") for p, data in ports_data.items()}
                }
            else:
                # Single-port results
                preview_df = df.head(100) if df is not None else pl.DataFrame()
                schema = [{"name": name, "type": str(dtype)} for name, dtype in df.schema.items()] if df is not None else []
                preview_rows = preview_df.to_dicts() if df is not None else []

                self._cache[node_id] = {
                    "status": "success",
                    "schema": schema,
                    "preview": preview_rows,
                    "row_count": df.height if df is not None else 0,
                    "column_count": df.width if df is not None else 0,
                    "duration_ms": duration_ms,
                    "logs": logs,
                    "error": None
                }
                self._cache[node_id]["_df"] = df

    def set_node_error(self, node_id: str, error_msg: str, duration_ms: float, logs: List[str]):
        with self._lock:
            self._cache[node_id] = {
                "status": "error",
                "schema": [],
                "preview": [],
                "row_count": 0,
                "column_count": 0,
                "duration_ms": duration_ms,
                "logs": logs + [f"Error: {error_msg}"],
                "error": error_msg,
                "_df": None
            }

    def get_node_df(self, node_id: str, port_id: str = "output") -> pl.DataFrame:
        with self._lock:
            node_data = self._cache.get(node_id)
            if not node_data:
                return None
            if "_ports_df" in node_data:
                if port_id == "output" or not port_id:
                    port_id = "true" if "true" in node_data["_ports_df"] else (list(node_data["_ports_df"].keys())[0] if node_data["_ports_df"] else "")
                return node_data["_ports_df"].get(port_id)
            return node_data.get("_df")

    def get_node_result_payload(self, node_id: str) -> Dict[str, Any]:
        with self._lock:
            res = self._cache.get(node_id, {}).copy()
            if "_df" in res:
                del res["_df"]
            if "_ports_df" in res:
                del res["_ports_df"]
            return res

    def get_all_results(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            payload = {}
            for k, v in self._cache.items():
                node_res = v.copy()
                if "_df" in node_res:
                    del node_res["_df"]
                if "_ports_df" in node_res:
                    del node_res["_ports_df"]
                payload[k] = node_res
            return payload

    def add_global_log(self, message: str):
        with self._lock:
            self._global_logs.append(message)

    def get_global_logs(self) -> List[str]:
        with self._lock:
            return list(self._global_logs)

# Global singleton cache instance
cache = PipelineCache()
