import sys
sys.path.insert(0, 'G:/My Drive/Projects/VibeETL/backend')
import json
from app.engine import execute_pipeline

dag = {
    "nodes": [{"id": "node_1", "type": "fileInput", "parameters": {}}],
    "edges": []
}

try:
    print("Executing pipeline...")
    res = execute_pipeline(dag)
    print("Result:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
