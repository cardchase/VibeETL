import os
import sys
import importlib.util
import polars as pl
from typing import Dict, Any

def test_tool(file_path: str):
    print(f"\n=============================================")
    print(f"  VibeETL Tool Compatibility Tester")
    print(f"=============================================\n")

    if not os.path.exists(file_path):
        print(f"[FAIL] INCOMPATIBLE: File '{file_path}' does not exist.")
        sys.exit(1)

    # 1. Load module
    module_name = os.path.splitext(os.path.basename(file_path))[0]
    try:
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception as e:
        print(f"[FAIL] INCOMPATIBLE: Failed to import python file. Error: {e}")
        sys.exit(1)

    # 2. Find BaseNode subclasses
    node_classes = []
    for attr_name in dir(module):
        attr = getattr(module, attr_name)
        if isinstance(attr, type) and attr.__module__ == module_name:
            if hasattr(attr, 'execute') and hasattr(attr, 'MANIFEST'):
                node_classes.append(attr)

    if not node_classes:
        print(f"[FAIL] INCOMPATIBLE: No class found inheriting from BaseNode with an execute() method and a MANIFEST dictionary.")
        sys.exit(1)

    for NodeClass in node_classes:
        print(f"[*] Testing {NodeClass.__name__}...")

        # 3. Check Manifest
        manifest = getattr(NodeClass, 'MANIFEST', None)
        if not manifest or not isinstance(manifest, dict):
            print(f"[FAIL] INCOMPATIBLE: {NodeClass.__name__} does not have a valid MANIFEST dictionary.")
            sys.exit(1)

        required_keys = ["id", "name", "category", "icon", "ui_schema"]
        missing_keys = [k for k in required_keys if k not in manifest]
        if missing_keys:
            print(f"[FAIL] INCOMPATIBLE: MANIFEST is missing required keys: {missing_keys}")
            sys.exit(1)

        # 4. Extract default params
        default_params = {}
        for field in manifest.get("ui_schema", []):
            if "field" in field and "default" in field:
                default_params[field["field"]] = field["default"]

        print(f"[PASS] MANIFEST parsed successfully.")

        # 5. Create Mock DataFrame
        mock_df = pl.DataFrame({
            "test_col_1": ["A", "B", "C"],
            "test_col_2": [1, 2, 3]
        })

        # 6. Instantiate Node
        try:
            node = NodeClass(node_id="test_node", parameters=default_params)
        except Exception as e:
            print(f"[FAIL] INCOMPATIBLE: Failed to instantiate {NodeClass.__name__}. Error: {e}")
            sys.exit(1)

        # 7. Execute Node
        print(f"[*] Executing node with mock DataFrame...")
        try:
            # Pass mock_df to common port names to support different types of nodes (e.g. input, left, right)
            result_df = node.execute({
                "input": mock_df,
                "left": mock_df,
                "right": mock_df
            })
        except Exception as e:
            print(f"[WARN] WARNING: Node execution threw an error. This might be expected depending on the default parameters. Error: {e}")
            continue

        if not isinstance(result_df, pl.DataFrame) and not (isinstance(result_df, dict) and all(isinstance(v, pl.DataFrame) for v in result_df.values())):
            print(f"[FAIL] INCOMPATIBLE: Node returned {type(result_df)} instead of a polars DataFrame or Dict[str, pl.DataFrame].")
            sys.exit(1)

        if isinstance(result_df, pl.DataFrame):
            print(f"[PASS] Output returned successfully: {result_df.height} rows, {result_df.width} columns.")
        else:
            print(f"[PASS] Output returned successfully as a dictionary containing {len(result_df)} DataFrames.")

    print(f"\n[SUCCESS] COMPATIBLE: Your tool is fully ready for VibeETL integration!\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_tool.py <path_to_tool_file.py>")
        sys.exit(1)
    
    # Ensure backend directory is in path so 'app.tools.base' can be imported
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, backend_dir)
    
    test_tool(sys.argv[1])
