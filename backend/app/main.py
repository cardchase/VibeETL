import os
import shutil
import polars as pl
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
from app.engine import execute_pipeline
from app.cache import cache
from app.tools.file_input import FileInputNode
from app.tools import NODE_CLASSES

app = FastAPI(title="VibeETL - Self-hosted Alteryx Engine")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {"message": "VibeETL Engine is running.", "status": "active"}

@app.get("/api/tools")
def get_tools():
    """
    Returns a dynamic list of all registered tools and their UI schema definitions.
    """
    tools = []
    for node_id, node_class in NODE_CLASSES.items():
        if hasattr(node_class, 'MANIFEST') and node_class.MANIFEST:
            manifest = node_class.MANIFEST.copy()
            # Ensure default_params is generated from ui_schema
            default_params = {}
            for field in manifest.get("ui_schema", []):
                default_params[field["field"]] = field.get("default")
            manifest["defaultParams"] = default_params
            tools.append(manifest)
    return {"tools": tools}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a file (CSV, Excel, PDF) to the local upload directory.
    Parses its schema and returns details immediately to populate node configuration.
    """
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Attempt to read file immediately to get schema preview
        # Instantiate a mock FileInputNode to read it
        mock_node = FileInputNode(node_id="upload_preview", parameters={"filePath": file.filename, "fileType": "auto"})
        df = mock_node.execute(inputs={})

        schema = [{"name": name, "type": str(dtype)} for name, dtype in df.schema.items()]
        preview = df.head(10).to_dicts()

        return {
            "status": "success",
            "filename": file.filename,
            "filePath": file.filename, # relative path
            "schema": schema,
            "preview": preview,
            "row_count": df.height,
            "column_count": df.width
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process uploaded file: {str(e)}")

@app.post("/api/execute")
async def execute_dag(pipeline: Dict[str, Any] = Body(...)):
    """
    Receives JSON representation of visual nodes and wires, runs topological sort,
    and executes nodes in order. Returns preview rows and execution logs for each node.
    """
    try:
        result = execute_pipeline(pipeline)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing pipeline: {str(e)}")

@app.post("/api/clear-cache")
async def clear_cache():
    """
    Clears the entire pipeline cache.
    """
    try:
        cache.clear()
        return {"status": "success", "message": "Cache cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing cache: {str(e)}")

@app.post("/api/node/schema")
async def get_node_schema(payload: Dict[str, Any] = Body(...)):
    """
    Returns the schema of a node's output if it has been executed and exists in the cache.
    Useful for configuring downstream nodes.
    """
    node_id = payload.get("nodeId")
    if not node_id:
        raise HTTPException(status_code=400, detail="Missing nodeId in request.")
    
    result = cache.get_node_result_payload(node_id)
    if not result:
        return {"status": "not_executed", "schema": []}
        
    return {
        "status": result.get("status"),
        "schema": result.get("schema", []),
        "error": result.get("error")
    }

@app.get("/api/excel/sheets")
def get_excel_sheets(filePath: str):
    """
    Scans the Excel file located in uploads/ (or absolute path) and returns sheet names.
    Uses Calamine under the hood for lightning fast metadata extraction.
    """
    try:
        if not filePath:
            return {"sheets": []}
        
        # Resolve path
        if not os.path.isabs(filePath):
            file_path = os.path.abspath(os.path.join(UPLOAD_DIR, filePath))
        else:
            file_path = filePath

        if not os.path.exists(file_path):
            return {"sheets": []}

        # Open workbook metadata using Calamine
        from calamine import CalamineWorkbook
        workbook = CalamineWorkbook.from_path(file_path)
        return {"sheets": workbook.sheet_names}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scan workbook sheets: {str(e)}")

@app.get("/api/logs")
def get_global_logs():
    return {"logs": cache.get_global_logs()}
