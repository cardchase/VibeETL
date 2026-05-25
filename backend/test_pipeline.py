import sys
import os

# Add the current directory to sys.path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.engine import execute_pipeline
from app.cache import cache

def test_dag_execution():
    print("=== Testing Topological Sort and Pipeline Execution ===")
    
    # Define a sample pipeline: FileInput (employees.csv) -> Filter (Age > 30) -> Sort (Salary Asc) -> Select (Rename Salary to Compensation)
    pipeline_data = {
        "nodes": [
            {
                "id": "node_1",
                "type": "fileInput",
                "parameters": {
                    "filePath": "employees.csv",
                    "fileType": "csv",
                    "csvDelimiter": ",",
                    "csvHeader": True
                },
                "data": {"label": "File Input"}
            },
            {
                "id": "node_2",
                "type": "filter",
                "parameters": {
                    "column": "Age",
                    "operator": ">",
                    "value": "30"
                },
                "data": {"label": "Filter Age > 30"}
            },
            {
                "id": "node_3",
                "type": "sort",
                "parameters": {
                    "column": "Salary",
                    "descending": False
                },
                "data": {"label": "Sort Salary ASC"}
            },
            {
                "id": "node_4",
                "type": "select",
                "parameters": {
                    "columns": [
                        {"name": "Name", "keep": True, "rename": "Employee Name"},
                        {"name": "Age", "keep": True, "rename": "Age"},
                        {"name": "Department", "keep": True, "rename": "Dept"},
                        {"name": "Salary", "keep": True, "rename": "Compensation"}
                    ]
                },
                "data": {"label": "Select columns"}
            }
        ],
        "edges": [
            {"id": "e1", "source": "node_1", "target": "node_2", "sourcePort": "output", "targetPort": "input"},
            {"id": "e2", "source": "node_2", "target": "node_3", "sourcePort": "output", "targetPort": "input"},
            {"id": "e3", "source": "node_3", "target": "node_4", "sourcePort": "output", "targetPort": "input"}
        ]
    }
    
    # Run pipeline
    result = execute_pipeline(pipeline_data)
    
    # Verify execution outcome
    if result["status"] == "success":
        print("\nPipeline executed successfully!")
        print("\nGlobal logs:")
        for log in result["global_logs"]:
            print(f"  {log}")
            
        print("\nNode results preview:")
        for node_id, data in result["results"].items():
            print(f"  Node {node_id}: status={data['status']}, rows={data['row_count']}, columns={data['column_count']}, duration={data['duration_ms']:.1f}ms")
            if data["status"] == "success" and data["preview"]:
                print(f"    Sample Row 1: {data['preview'][0]}")
        
        # Verify specific results
        node_4_res = result["results"]["node_4"]
        assert node_4_res["status"] == "success", "Select Node failed"
        assert node_4_res["row_count"] == 5, f"Expected 5 rows (Age > 30), got {node_4_res['row_count']}"
        assert node_4_res["column_count"] == 4, f"Expected 4 columns, got {node_4_res['column_count']}"
        first_row = node_4_res["preview"][0]
        assert "Employee Name" in first_row, "Column rename failed"
        assert "Compensation" in first_row, "Column rename failed"
        
        print("\n[PASS] All programmatic pipeline tests passed successfully!")
    else:
        print(f"\n[FAIL] Pipeline execution failed: {result.get('error')}")
        sys.exit(1)

if __name__ == "__main__":
    test_dag_execution()
