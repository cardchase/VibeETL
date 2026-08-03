import time
import polars as pl
from graphlib import TopologicalSorter
from typing import Dict, Any, List, Set
from app.cache import cache_manager
from app.tools import NODE_CLASSES

def execute_pipeline(pipeline_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes the visual ETL pipeline DAG in-memory.
    pipeline_data contains:
      - nodes: List[Dict[str, Any]]
      - edges: List[Dict[str, Any]]
      - session_id: str
    """
    session_id = pipeline_data.get("session_id", "default")
    workflow_name = pipeline_data.get("workflow_name", session_id)
    cache = cache_manager.get_cache(session_id)
    cache.set_is_running(True)
    pipeline_start_time = time.time()

    try:
        nodes_list = pipeline_data.get("nodes", [])
        edges_list = pipeline_data.get("edges", [])

        # Map node_id to its full configuration
        node_map_initial = {n["id"]: n for n in nodes_list}

        def is_node_enabled(n_id):
            curr_id = n_id
            while curr_id:
                n = node_map_initial.get(curr_id)
                if not n:
                    break
                if n.get("type") == "container" and n.get("data", {}).get("enabled") is False:
                    return False
                curr_id = n.get("parentId")
            return True

        # Identify nodes explicitly marked as cached or in disabled containers that ALREADY have a successful result
        cached_node_ids = set()
        for n in nodes_list:
            is_disabled_container = not is_node_enabled(n["id"])
            is_user_cached = n.get("parameters", {}).get("isCached", False)
        
            if is_disabled_container or is_user_cached:
                existing_result = cache.get_node_result_payload(n["id"])
                if existing_result and existing_result.get("status") in ["success", "skipped"]:
                    cached_node_ids.add(n["id"])

        cache.clear_except(list(cached_node_ids))
        cache.reset_cancellations()
        cache.add_global_log("Initializing pipeline execution...")

        enabled_nodes = []
        for n in nodes_list:
            if is_node_enabled(n["id"]):
                enabled_nodes.append(n)
            else:
                cache.set_node_skipped(n["id"], retain_cache=True)
            
        nodes_list = enabled_nodes
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

        # Filter predecessors map to only include needed nodes, and remove unneeded dependencies
        pruned_predecessors = {
            k: {p for p in v if p in needed_nodes}
            for k, v in predecessors.items() 
            if k in needed_nodes
        }

        # Topological sort on the pruned graph
        try:
            ts = TopologicalSorter(pruned_predecessors)
            execution_order = list(ts.static_order())
            
            # Improved UI Communication Logging
            total_nodes = len(node_map_initial)
            cache.add_global_log(f"Pipeline Analysis: {total_nodes} total nodes detected on canvas.")
            if cached_node_ids:
                cached_names = [f"'{node_map_initial[nid].get('data', {}).get('label', nid)}'" for nid in cached_node_ids]
                cache.add_global_log(f"Cache Hit: The following {len(cached_node_ids)} nodes have existing data and will be retrieved from cache: {', '.join(cached_names)}")
            
            nodes_to_execute = [nid for nid in execution_order if nid not in cached_node_ids]
            cache.add_global_log(f"Execution Plan: {len(nodes_to_execute)} nodes queued for active execution.")
            
            cache.add_global_log(f"Topological sort successful. Execution order: {execution_order}")
        except Exception as e:
            error_msg = f"Circular dependency detected in graph: {e}"
            cache.add_global_log(error_msg)
            return {"status": "error", "error": error_msg, "results": {}}

        # Initialize statuses for the UI
        for node_id in execution_order:
            if node_id not in cached_node_ids:
                cache.set_node_status(node_id, "waiting")

        # Mark pruned nodes as skipped for UI feedback (bypassed by cache)
        skipped_nodes = [n["id"] for n in nodes_list if n["id"] not in needed_nodes]
        for node_id in skipped_nodes:
            cache.set_node_skipped(node_id)

        # Execute nodes in topological order
        exec_idx = 1
        for node_id in execution_order:
            node_cfg = node_map.get(node_id)
            if not node_cfg:
                cache.add_global_log(f"Skipping node {node_id}: definition missing in pipeline.")
                continue

            node_type = node_cfg.get("type")
        
            if node_type == "container":
                cache.set_node_status(node_id, "success")
                continue
            
            parameters = node_cfg.get("parameters", {})
        
            # Append [exec_idx] to the node name so the logs match the UI canvas
            base_name = node_cfg.get("data", {}).get("label", f"{node_type}_{node_id}")
            node_name = f"{base_name} [{exec_idx}]"
            exec_idx += 1

            cache.add_global_log(f"Starting execution of node '{node_name}' ({node_id})")
            start_time = time.time()
            node_logs = [f"Node '{node_name}' initialization..."]

            if cache.is_cancelled(node_id):
                duration = (time.time() - start_time) * 1000
                err_msg = "Execution cancelled by user."
                cache.set_node_error(node_id, err_msg, duration, node_logs + [err_msg])
                cache.add_global_log(f"Node '{node_name}' execution aborted (Cancelled).")
                # If global cancel is true, break the entire pipeline execution loop
                if cache.is_cancelled():
                    break
                continue

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
                # Try to dynamically load from sandbox directory
                import glob
                import importlib.util
                sandbox_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sandbox"))
                sandbox_files = glob.glob(os.path.join(sandbox_dir, "*.py"))
                for tool_file in sandbox_files:
                    if os.path.basename(tool_file) == "__init__.py": continue
                    try:
                        module_name = f"sandbox.{os.path.basename(tool_file)[:-3]}"
                        spec = importlib.util.spec_from_file_location(module_name, tool_file)
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)
                        from app.tools.base import BaseNode
                        for attr_name in dir(module):
                            attr = getattr(module, attr_name)
                            if isinstance(attr, type) and issubclass(attr, BaseNode) and attr is not BaseNode:
                                if hasattr(attr, 'MANIFEST') and attr.MANIFEST and attr.MANIFEST.get("type") == node_type:
                                    node_class = attr
                                    break
                    except Exception:
                        pass
                    if node_class: break
                
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
            
                # Inject session_id, workflow_name, and cancellation lambda
                executor.session_id = session_id
                executor.workflow_name = workflow_name
                executor.is_cancelled = lambda: cache.is_cancelled(node_id)
            
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
            
                # Check if the node exposes an untruncated full dataframe for the background pipeline
                full_df = getattr(executor, "get_full_dataframe", lambda: res_df)()
            
                is_safeguard_active = False
                if isinstance(full_df, pl.DataFrame) and isinstance(res_df, pl.DataFrame):
                    if full_df.height > 0 and full_df.height != res_df.height:
                        is_safeguard_active = True
                        msg = f"Node '{node_name}' activated Intelligent Safeguard. Passing full {full_df.height} rows downstream, but previewing top {res_df.height}."
                        cache.add_global_log(msg)
                        all_logs.append(msg)

                if isinstance(full_df, dict):
                    row_counts = ", ".join([f"{port}: {df.height} rows" for port, df in res_df.items() if df is not None])
                    out_log = f"Node '{node_name}' executed successfully in {duration:.1f}ms. Output: {row_counts}"
                else:
                    out_log = f"Node '{node_name}' executed successfully in {duration:.1f}ms. Output: {res_df.height} rows."
                
                cache.add_global_log(out_log)
                all_logs.append(out_log)
                all_logs.append(f"Execution complete. Click on the node and check the Data View pane to preview results.")

                # Save full output to cache for downstream nodes to use (frontend payload truncation is handled by the cache)
                cache.set_node_result(node_id, full_df, duration, all_logs, node_semantic_metadata, ui_payload=res_df)
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                err_msg = str(e)
                cache.set_node_error(node_id, err_msg, duration, node_logs + [f"Runtime Exception: {err_msg}"])
                cache.add_global_log(f"Node '{node_name}' execution failed: {err_msg}")

        total_time = (time.time() - pipeline_start_time) * 1000
        cache.add_global_log(f"Pipeline execution finished in {total_time:.1f}ms.")
        return {
            "status": "success",
            "global_logs": cache.get_global_logs(),
            "results": cache.get_all_results()
        }
    finally:
        cache.set_is_running(False)
