import threading
import polars as pl
from typing import Dict, Any, List

class PipelineCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._global_logs: List[str] = []
        self._node_statuses: Dict[str, str] = {}

    def clear(self):
        with self._lock:
            self._cache.clear()
            self._global_logs.clear()
            self._node_statuses.clear()

    def clear_except(self, keep_node_ids: List[str]):
        with self._lock:
            nodes_to_delete = [k for k in self._cache.keys() if k not in keep_node_ids]
            for k in nodes_to_delete:
                del self._cache[k]
                if k in self._node_statuses:
                    del self._node_statuses[k]
            self._global_logs.clear()

    def set_node_result(self, node_id: str, df: Any, duration_ms: float, logs: List[str], semantic_metadata: Dict[str, str] = None, ui_payload: Any = None):
        with self._lock:
            import polars as pl
            if isinstance(df, dict):
                # Multi-port results mapping: port_name -> pl.DataFrame
                ports_data = {}
                for port, port_df in df.items():
                    if port_df is not None:
                        preview_df = port_df.head(1000)
                        schema = []
                        for name, dtype in port_df.schema.items():
                            col_meta = {"name": name, "type": str(dtype)}
                            if semantic_metadata and name in semantic_metadata:
                                col_meta["semantic_type"] = semantic_metadata[name]
                            schema.append(col_meta)
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
                    "semantic_metadata": semantic_metadata or {},
                    "ports": {p: {k: v for k, v in data.items() if k != "_df"} for p, data in ports_data.items()},
                    "_ports_df": {p: data.get("_df") for p, data in ports_data.items()}
                }
                self._node_statuses[node_id] = "success"
            else:
                # Single-port results
                # Use ui_payload for the frontend preview if provided, otherwise use the full df
                serialization_df = ui_payload if ui_payload is not None else df
                
                preview_df = serialization_df.head(1000) if serialization_df is not None else pl.DataFrame()
                schema = []
                if serialization_df is not None:
                    for name, dtype in serialization_df.schema.items():
                        col_meta = {"name": name, "type": str(dtype)}
                        if semantic_metadata and name in semantic_metadata:
                            col_meta["semantic_type"] = semantic_metadata[name]
                        schema.append(col_meta)
                preview_rows = preview_df.to_dicts() if serialization_df is not None else []

                self._cache[node_id] = {
                    "status": "success",
                    "schema": schema,
                    "preview": preview_rows,
                    "row_count": df.height if df is not None else 0,
                    "column_count": df.width if df is not None else 0,
                    "duration_ms": duration_ms,
                    "logs": logs,
                    "error": None,
                    "semantic_metadata": semantic_metadata or {}
                }
                self._cache[node_id]["_df"] = df
                self._node_statuses[node_id] = "success"

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
                "semantic_metadata": {},
                "_df": None
            }
            self._node_statuses[node_id] = "error"

    def set_node_skipped(self, node_id: str, retain_cache: bool = False):
        with self._lock:
            if retain_cache and node_id in self._cache and self._cache[node_id].get("status") in ["success", "skipped"]:
                # Preserve the cached data but ensure status is skipped
                self._cache[node_id]["status"] = "skipped"
                if "logs" not in self._cache[node_id]:
                    self._cache[node_id]["logs"] = []
                self._cache[node_id]["logs"].append("Bypassed: Using previously cached data from disabled container.")
            else:
                self._cache[node_id] = {
                    "status": "skipped",
                    "schema": [],
                    "preview": [],
                    "row_count": 0,
                    "column_count": 0,
                    "duration_ms": 0,
                    "logs": ["Bypassed: Data is cached downstream."],
                    "error": None,
                    "semantic_metadata": {},
                    "_df": None
                }
            self._node_statuses[node_id] = "skipped"

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

    def set_node_status(self, node_id: str, status: str):
        with self._lock:
            self._node_statuses[node_id] = status

    def get_status_payload(self) -> Dict[str, Any]:
        with self._lock:
            payload = {}
            for node_id, status in self._node_statuses.items():
                node_data = self._cache.get(node_id, {})
                payload[node_id] = {
                    "status": status,
                    "row_count": node_data.get("row_count"),
                    "ports": node_data.get("ports")
                }
            return payload

# Global singleton cache instance
cache = PipelineCache()
