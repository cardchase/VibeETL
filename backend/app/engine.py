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
    cache.add_global_log("Initializing pipeline execution...")

    nodes_list = pipeline_data.get("nodes", [])
    edges_list = pipeline_data.get("edges", [])

    # Identify nodes explicitly marked as cached by the user that ALREADY have a successful result
    cached_node_ids = set()
    for n in nodes_list:
        if n.get("parameters", {}).get("isCached", False):
            existing_result = cache.get_node_result_payload(n["id"])
            if existing_result and existing_result.get("status") == "success":
                cached_node_ids.add(n["id"])

    cache.clear_except(list(cached_node_ids))

    # Map node_id to its full configuration
    node_map = {n["id"]: n for n in nodes_list}

    # Build predecessors mapping for topological sort
    # graphlib.TopologicalSorter expects: {node: {predecessor1, predecessor2, ...}}
    predecessors: Dict[str, Set[str]] = {n["id"]: set() for n in nodes_list}
    
    # Track links for routing data during execution
    # target_node_id -> target_port -> List[(source_node_id, source_port)]
    data_links: Dict[str, Dict[str, List[tuple]]] = {n["id"]: {} for n in nodes_list}

    for edge in edges_list:
        src = edge.get("source")
        tgt = edge.get("target")
        src_port = edge.get("sourcePort", "output")
        tgt_port = edge.get("targetPort", "input")

        if src in predecessors and tgt in predecessors:
            predecessors[tgt].add(src)
            if tgt_port not in data_links[tgt]:
                data_links[tgt][tgt_port] = []
            data_links[tgt][tgt_port].append((src, src_port))

    # Determine required nodes via backward traversal (DAG Pruning)
    needed_nodes = set()
    # Terminal nodes are nodes that are not the source of any edge
    all_sources = set(e.get("source") for e in edges_list)
    terminal_nodes = [n["id"] for n in nodes_list if n["id"] not in all_sources]
    
    # If graph is empty or has cycle where everything is connected, fallback to all nodes
    if not terminal_nodes and nodes_list:
        terminal_nodes = [n["id"] for n in nodes_list]

    queue = list(terminal_nodes)
    while queue:
        curr = queue.pop(0)
        if curr not in needed_nodes:
            needed_nodes.add(curr)
            # If the current node is cached, it acts as a data source. 
            # We DO NOT need its predecessors!
            if curr not in cached_node_ids:
                for pred in predecessors.get(curr, set()):
                    queue.append(pred)

    # Filter predecessors map to only include needed nodes
    pruned_predecessors = {k: v for k, v in predecessors.items() if k in needed_nodes}

    # Topological sort on the pruned graph
    try:
        ts = TopologicalSorter(pruned_predecessors)
        execution_order = list(ts.static_order())
        cache.add_global_log(f"Topological sort successful. Execution order: {execution_order}")
    except Exception as e:
        error_msg = f"Circular dependency detected in graph: {e}"
        cache.add_global_log(error_msg)
        return {"status": "error", "error": error_msg, "results": {}}

    # Initialize statuses for the UI
    for node_id in execution_order:
        if node_id not in cached_node_ids:
            cache.set_node_status(node_id, "waiting")

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

        if node_id in cached_node_ids:
            cache.add_global_log(f"Node '{node_name}' is cached. Skipping execution and using existing data.")
            # Ensure it is in the results payload so the frontend knows it was successful
            continue

        # 1. Fetch input dataframes from cache based on connections
        inputs = {}
        input_metadata = {}
        dependency_failed = False
        
        for port, source_links in data_links.get(node_id, {}).items():
            port_dfs = []
            for src_id, src_port in source_links:
                src_result = cache.get_node_result_payload(src_id)
                if src_result.get("status") == "error":
                    dependency_failed = True
                    node_logs.append(f"Dependency error: Upstream node '{src_id}' failed.")
                    break
                    
                df = cache.get_node_df(src_id, src_port)
                if df is not None:
                    port_dfs.append(df)
                    node_logs.append(f"Retrieved input from '{src_id}' ({src_port}): {df.height} rows.")
                    
                    # Merge semantic metadata from upstream node
                    src_meta = src_result.get("semantic_metadata", {})
                    input_metadata.update(src_meta)
                else:
                    node_logs.append(f"Warning: Connection from '{src_id}' was set but no data was received.")
            
            if dependency_failed:
                break
                
            # Backward compatibility: single dataframe if 1 connection, list if >1 connection
            if port_dfs:
                inputs[port] = port_dfs[0] if len(port_dfs) == 1 else port_dfs

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
            # Set status to running so UI knows this node is currently executing
            cache.set_node_status(node_id, "running")
            
            # Instantiate executor
            executor = node_class(node_id, parameters)
            
            # Inject upstream semantic metadata for nodes that need it (e.g. Visualization)
            executor.upstream_semantic_metadata = input_metadata
            
            # Execute node logic
            res_df = executor.execute(inputs)
            
            # Combine semantic metadata: input_metadata + executor's new metadata
            node_semantic_metadata = input_metadata.copy()
            if hasattr(executor, "_semantic_metadata") and executor._semantic_metadata:
                node_semantic_metadata.update(executor._semantic_metadata)
            
            # Combine engine logs with node specific logs
            all_logs = node_logs + executor.logs
            duration = (time.time() - start_time) * 1000
            
            # Save output to cache
            cache.set_node_result(node_id, res_df, duration, all_logs, node_semantic_metadata)
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
