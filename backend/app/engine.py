import time
from graphlib import TopologicalSorter
from typing import Dict, Any, List, Set
from app.cache import cache
from app.tools import NODE_CLASSES

def execute_pipeline(pipeline_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes the visual ETL pipeline DAG in-memory.
    pipeline_data contains:
      - nodes: List[Dict[str, Any]]
      - edges: List[Dict[str, Any]]
    """
    cache.clear()
    cache.add_global_log("Initializing pipeline execution...")

    nodes_list = pipeline_data.get("nodes", [])
    edges_list = pipeline_data.get("edges", [])

    # Map node_id to its full configuration
    node_map = {n["id"]: n for n in nodes_list}

    # Build predecessors mapping for topological sort
    # graphlib.TopologicalSorter expects: {node: {predecessor1, predecessor2, ...}}
    predecessors: Dict[str, Set[str]] = {n["id"]: set() for n in nodes_list}
    
    # Track links for routing data during execution
    # target_node_id -> target_port -> (source_node_id, source_port)
    data_links: Dict[str, Dict[str, tuple]] = {n["id"]: {} for n in nodes_list}

    for edge in edges_list:
        src = edge.get("source")
        tgt = edge.get("target")
        src_port = edge.get("sourcePort", "output")
        tgt_port = edge.get("targetPort", "input")

        if src in predecessors and tgt in predecessors:
            predecessors[tgt].add(src)
            data_links[tgt][tgt_port] = (src, src_port)

    # Topological sort
    try:
        ts = TopologicalSorter(predecessors)
        execution_order = list(ts.static_order())
        cache.add_global_log(f"Topological sort successful. Execution order: {execution_order}")
    except Exception as e:
        error_msg = f"Circular dependency detected in graph: {e}"
        cache.add_global_log(error_msg)
        return {"status": "error", "error": error_msg, "results": {}}

    # Execute nodes in topological order
    for node_id in execution_order:
        node_cfg = node_map.get(node_id)
        if not node_cfg:
            cache.add_global_log(f"Skipping node {node_id}: definition missing in pipeline.")
            continue

        node_type = node_cfg.get("type")
        parameters = node_cfg.get("parameters", {})
        node_name = node_cfg.get("data", {}).get("label", f"{node_type}_{node_id}")

        cache.add_global_log(f"Starting execution of node '{node_name}' ({node_id})")
        start_time = time.time()
        node_logs = [f"Node '{node_name}' initialization..."]

        # 1. Fetch input dataframes from cache based on connections
        inputs = {}
        dependency_failed = False
        
        for port, (src_id, src_port) in data_links.get(node_id, {}).items():
            src_result = cache.get_node_result_payload(src_id)
            if src_result.get("status") == "error":
                dependency_failed = True
                node_logs.append(f"Dependency error: Upstream node '{src_id}' failed.")
                break
                
            df = cache.get_node_df(src_id, src_port)
            if df is not None:
                inputs[port] = df
                node_logs.append(f"Retrieved input from '{src_id}' ({src_port}): {df.height} rows.")
            else:
                node_logs.append(f"Warning: Connection from '{src_id}' was set but no data was received.")

        if dependency_failed:
            duration = (time.time() - start_time) * 1000
            cache.set_node_error(node_id, "Upstream node execution failed.", duration, node_logs)
            cache.add_global_log(f"Node '{node_name}' failed due to upstream dependency error.")
            continue

        # 2. Instantiate and execute the node
        node_class = NODE_CLASSES.get(node_type)
        if not node_class:
            duration = (time.time() - start_time) * 1000
            err_msg = f"Unknown node type: {node_type}"
            cache.set_node_error(node_id, err_msg, duration, node_logs)
            cache.add_global_log(f"Node '{node_name}' failed: {err_msg}")
            continue

        try:
            # Instantiate executor
            executor = node_class(node_id, parameters)
            
            # Execute node logic
            res_df = executor.execute(inputs)
            
            # Combine engine logs with node specific logs
            all_logs = node_logs + executor.logs
            duration = (time.time() - start_time) * 1000
            
            # Save output to cache
            cache.set_node_result(node_id, res_df, duration, all_logs)
            if isinstance(res_df, dict):
                row_counts = ", ".join([f"{port}: {df.height} rows" for port, df in res_df.items() if df is not None])
                cache.add_global_log(f"Node '{node_name}' executed successfully in {duration:.1f}ms. Output: {row_counts}")
            else:
                cache.add_global_log(f"Node '{node_name}' executed successfully in {duration:.1f}ms. Output: {res_df.height} rows.")
        except Exception as e:
            duration = (time.time() - start_time) * 1000
            err_msg = str(e)
            cache.set_node_error(node_id, err_msg, duration, node_logs + [f"Runtime Exception: {err_msg}"])
            cache.add_global_log(f"Node '{node_name}' execution failed: {err_msg}")

    cache.add_global_log("Pipeline execution finished.")
    return {
        "status": "success",
        "global_logs": cache.get_global_logs(),
        "results": cache.get_all_results()
    }
