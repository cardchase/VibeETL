import os
import shutil
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass
import polars as pl
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from app.engine import execute_pipeline
from app.cache import cache_manager
from app.tools.file_input import FileInputNode
from app.tools import NODE_CLASSES

app = FastAPI(title="VibeETL - Self-hosted Alteryx Engine")

# Configure CORS for Enterprise Security
# Restrict origins strictly to the local frontend to prevent malicious websites from communicating with the local engine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:5173"
    ],
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

        # If the file is an image, skip schema parsing
        ext = os.path.splitext(file.filename)[1].lower()
        if ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff']:
            return {
                "status": "success",
                "filename": file.filename,
                "filePath": file.filename,
                "schema": [{"name": "ImagePath", "type": "String"}],
                "preview": [{"ImagePath": file.filename}],
                "row_count": 1,
                "column_count": 1
            }

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

from pydantic import BaseModel

class FileScanRequest(BaseModel):
    file_path: str

@app.post("/api/tools/file-scan")
async def scan_file(request: FileScanRequest):
    """
    Ingestion Scan Endpoint: Verifies path and returns schema details instantly.
    """
    file_path = request.file_path
    if not file_path:
        raise HTTPException(status_code=400, detail="Missing file_path")

    # Resolve path logic
    if not os.path.isabs(file_path):
        abs_path = os.path.join(UPLOAD_DIR, file_path)
    else:
        abs_path = file_path

    # Verify path is safe
    try:
        from app.tools.file_output import verify_safe_file_path
        verify_safe_file_path(abs_path)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(abs_path)[1].lower()
    
    detected_type = "csv"
    inferred_dialect = {}
    schema_blueprint = []
    excel_sheets = []

    try:
        if ext in ['.csv', '.txt']:
            detected_type = "csv"
            # Attempt fast scan using polars
            # Using lazy execution or scan to read only schema
            lf = pl.scan_csv(abs_path, infer_schema_length=1000)
            schema = lf.collect_schema()
            schema_blueprint = [{"name": name, "type": str(dtype)} for name, dtype in schema.items()]
            inferred_dialect = {"delimiter": ",", "encoding": "utf-8"}
            
        elif ext in ['.xlsx', '.xls', '.ods']:
            detected_type = "xlsx"
            from calamine import CalamineWorkbook
            workbook = CalamineWorkbook.from_path(abs_path)
            excel_sheets = workbook.sheet_names
            if excel_sheets:
                # Polars does not have scan_excel yet, so we use read_excel
                # We can't prevent reading the file easily with calamine engine in read_excel if we just want schema,
                # but we will just read to get schema. The user mentioned "use a lightweight engine pass to scrape the list of sheet names"
                pass # schema_blueprint will be populated when a specific sheet is chosen, or we could leave it empty.
                
        elif ext in ['.parquet', '.arrow']:
            detected_type = "parquet"
            # Read metadata footer using scan_parquet
            lf = pl.scan_parquet(abs_path)
            schema = lf.collect_schema()
            schema_blueprint = [{"name": name, "type": str(dtype)} for name, dtype in schema.items()]
            
        elif ext in ['.json']:
            detected_type = "json"
            df = pl.read_json(abs_path)
            schema = df.schema
            schema_blueprint = [{"name": name, "type": str(dtype)} for name, dtype in schema.items()]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scan file: {str(e)}")

    return {
        "detected_type": detected_type,
        "inferred_dialect": inferred_dialect,
        "schema_blueprint": schema_blueprint,
        "excel_sheets": excel_sheets
    }


from fastapi.concurrency import run_in_threadpool

@app.post("/api/execute")
async def execute_dag(pipeline: Dict[str, Any] = Body(...)):
    """
    Receives JSON representation of visual nodes and wires, runs topological sort,
    and executes nodes in order. Returns preview rows and execution logs for each node.
    """
    try:
        # Run the CPU-bound execution in a separate thread so we don't block the event loop
        result = await run_in_threadpool(execute_pipeline, pipeline)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing pipeline: {str(e)}")

@app.get("/api/pick_save_file")
def pick_save_file():
    """Opens a native OS file dialog to pick a save destination for outputs."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.attributes("-topmost", True)
        root.withdraw()
        file_path = filedialog.asksaveasfilename(
            title="Select Output Save Location",
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("Excel files", "*.xlsx"), ("Parquet files", "*.parquet"), ("JSON files", "*.json"), ("HTML files", "*.html"), ("All files", "*.*")]
        )
        root.destroy()
        if not file_path:
            return {"file_path": ""}
        return {"file_path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pick_open_file")
def pick_open_file():
    """Opens a native OS file dialog to pick an input file from absolute path."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.attributes("-topmost", True)
        root.withdraw()
        file_path = filedialog.askopenfilename(
            title="Select File to Open",
            filetypes=[("Data files", "*.csv *.xlsx *.xls *.parquet *.json *.jsonl *.txt"), ("All files", "*.*")]
        )
        root.destroy()
        if not file_path:
            return {"file_path": ""}
        return {"file_path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cancel")
def cancel_execution(session_id: str = "default"):
    """
    Cancels the entire running pipeline.
    """
    cache_manager.get_cache(session_id).cancel_pipeline()
    return {"status": "cancelling"}

@app.post("/api/cancel/{node_id}")
def cancel_node_execution(node_id: str, session_id: str = "default"):
    """
    Cancels a specific node that is currently running.
    """
    cache_manager.get_cache(session_id).cancel_node(node_id)
    return {"status": "cancelling_node", "node_id": node_id}

@app.get("/api/status")
def get_status(session_id: str = "default"):
    """
    Returns the real-time execution status of all nodes. 
    Can be polled by the frontend during pipeline execution.
    """
    cache = cache_manager.get_cache(session_id)
    return {
        "statuses": cache.get_status_payload(),
        "global_logs": cache.get_global_logs()
    }

@app.post("/api/node/schema")
async def get_node_schema(payload: Dict[str, Any] = Body(...)):
    """
    Returns the schema of a node's output if it has been executed and exists in the cache.
    Useful for configuring downstream nodes.
    """
    node_id = payload.get("nodeId")
    session_id = payload.get("session_id", "default")
    if not node_id:
        raise HTTPException(status_code=400, detail="Missing nodeId in request.")
    
    result = cache_manager.get_cache(session_id).get_node_result_payload(node_id)
    if not result:
        return {"status": "not_executed", "schema": []}
        
    return {
        "status": result.get("status"),
        "schema": result.get("schema", []),
        "error": result.get("error")
    }

from fastapi.responses import Response, StreamingResponse
import io

@app.get("/api/download/csv")
def download_node_csv(nodeId: str, portId: str = "output", session_id: str = "default"):
    """
    Downloads the full DataFrame for a node's port as a CSV file.
    """
    df = cache_manager.get_cache(session_id).get_node_df(nodeId, portId)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found in cache. Please run the node first.")
        
    # Write DataFrame to an in-memory buffer
    buffer = io.BytesIO()
    df.write_csv(buffer)
    
    filename = f"VibeETL_Export_{nodeId}_{portId}.csv"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }
    
    return Response(content=buffer.getvalue(), media_type="text/csv", headers=headers)

from fastapi.responses import FileResponse

@app.get("/api/local-image")
def get_local_image(path: str):
    """
    Serves a local image file by absolute path if it exists.
    """
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter is required")
        
    # Check if the path is relative and exists in UPLOAD_DIR
    if not os.path.isabs(path) and not os.path.exists(path):
        upload_path = os.path.join(UPLOAD_DIR, path)
        if os.path.exists(upload_path):
            path = upload_path

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(path)

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
def get_global_logs(session_id: str = "default"):
    return {"logs": cache_manager.get_cache(session_id).get_global_logs()}

import json
import glob
from datetime import datetime

AUTOSAVES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".autosaves"))
os.makedirs(AUTOSAVES_DIR, exist_ok=True)

@app.post("/api/autosave")
async def autosave_workflow(pipeline: Dict[str, Any] = Body(...)):
    """
    Saves a rolling backup of the workflow to the server's .autosaves directory.
    Maintains a maximum of 10 backups.
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        workflow_name = pipeline.get("workflow_name", "Untitled_Workflow")
        
        # Sanitize the workflow name for filesystem safety
        import re
        safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', workflow_name)
        if not safe_name:
            safe_name = "Untitled_Workflow"
            
        filepath = os.path.join(AUTOSAVES_DIR, f"{safe_name}_autosave_{timestamp}.json")
        
        with open(filepath, "w") as f:
            json.dump(pipeline, f)
            
        # Keep only the last 10 files
        files = glob.glob(os.path.join(AUTOSAVES_DIR, "autosave_*.json"))
        files.sort() # Sorted by timestamp ascending because of %Y%m%d_%H%M%S format
        if len(files) > 10:
            for old_file in files[:-10]:
                os.remove(old_file)
                
        return {"status": "success", "message": f"Saved to {os.path.basename(filepath)}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autosave failed: {str(e)}")


# --- Google Sheets Authentication Endpoints ---
GOOGLE_AUTH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.vibe', 'google_auth'))
os.makedirs(GOOGLE_AUTH_DIR, exist_ok=True)

try:
    import gspread
    from google.oauth2.service_account import Credentials as ServiceAccountCredentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials as UserCredentials
except ImportError:
    gspread = None

@app.get('/api/google/auth/status')
def get_google_auth_status():
    if not gspread:
        return {'status': 'missing_dependencies'}
        
    token_path = os.path.join(GOOGLE_AUTH_DIR, 'token.json')
    client_secret_path = os.path.join(GOOGLE_AUTH_DIR, 'client_secret.json')
    service_account_path = os.path.join(GOOGLE_AUTH_DIR, 'service_account.json')
    
    if os.path.exists(service_account_path):
        return {'status': 'authenticated', 'method': 'service_account'}
        
    if os.path.exists(token_path):
        try:
            scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
            creds = UserCredentials.from_authorized_user_file(token_path, scopes)
            if creds and creds.valid:
                return {'status': 'authenticated', 'method': 'oauth'}
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(token_path, 'w') as f:
                    f.write(creds.to_json())
                return {'status': 'authenticated', 'method': 'oauth'}
        except Exception:
            pass
            
    if os.path.exists(client_secret_path):
        return {'status': 'needs_login'}
        
    return {'status': 'needs_setup'}

@app.post('/api/google/auth/setup')
async def setup_google_auth(file: UploadFile = File(...)):
    try:
        content = await file.read()
        json_data = json.loads(content)
        
        if 'type' in json_data and json_data['type'] == 'service_account':
            path = os.path.join(GOOGLE_AUTH_DIR, 'service_account.json')
            method = 'service_account'
        elif 'installed' in json_data or 'web' in json_data:
            path = os.path.join(GOOGLE_AUTH_DIR, 'client_secret.json')
            method = 'oauth'
        else:
            raise ValueError('Invalid Google Credentials JSON format. Must be Service Account or OAuth Client Secret.')
            
        with open(path, 'wb') as f:
            f.write(content)
            
        return {'status': 'success', 'method': method}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post('/api/google/auth/login')
async def login_google_oauth():
    client_secret_path = os.path.join(GOOGLE_AUTH_DIR, 'client_secret.json')
    token_path = os.path.join(GOOGLE_AUTH_DIR, 'token.json')
    
    if not os.path.exists(client_secret_path):
        raise HTTPException(status_code=400, detail='Client secret missing.')
        
    scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
    
    def run_flow():
        flow = InstalledAppFlow.from_client_secrets_file(client_secret_path, scopes)
        # Use port=0 to let the OS automatically assign an available port, 
        # avoiding WinError 10048 (Address already in use) conflicts.
        creds = flow.run_local_server(port=0)
        with open(token_path, 'w') as f:
            f.write(creds.to_json())
            
    try:
        await run_in_threadpool(run_flow)
        return {'status': 'success'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/api/google/sheets/worksheets')
def get_google_worksheets(url: str):
    if not gspread:
        raise HTTPException(status_code=500, detail='Missing dependencies.')
        
    if not url:
        return {'worksheets': []}
        
    spreadsheet_id = url
    if 'docs.google.com/spreadsheets/d/' in url:
        spreadsheet_id = url.split('/d/')[1].split('/')[0]
        
    token_path = os.path.join(GOOGLE_AUTH_DIR, 'token.json')
    service_account_path = os.path.join(GOOGLE_AUTH_DIR, 'service_account.json')
    scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
    
    creds = None
    try:
        if os.path.exists(service_account_path):
            creds = ServiceAccountCredentials.from_service_account_file(service_account_path, scopes=scopes)
        elif os.path.exists(token_path):
            creds = UserCredentials.from_authorized_user_file(token_path, scopes)
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(token_path, 'w') as f:
                    f.write(creds.to_json())
                    
        client = gspread.authorize(creds) if creds else gspread.client.Client(auth=None)
        spreadsheet = client.open_by_key(spreadsheet_id)
        worksheets = [ws.title for ws in spreadsheet.worksheets()]
        return {'worksheets': worksheets}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post('/api/google/auth/logout')
def logout_google_auth():
    for filename in ['token.json', 'client_secret.json', 'service_account.json']:
        path = os.path.join(GOOGLE_AUTH_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
    return {'status': 'success'}

@app.on_event("startup")
def on_startup():
    # Purge any leftover credentials from previous unexpected crashes
    for filename in ['token.json', 'client_secret.json', 'service_account.json']:
        path = os.path.join(GOOGLE_AUTH_DIR, filename)
        if os.path.exists(path):
            os.remove(path)

@app.on_event("shutdown")
def on_shutdown():
    # Purge credentials when the server cleanly shuts down
    for filename in ['token.json', 'client_secret.json', 'service_account.json']:
        path = os.path.join(GOOGLE_AUTH_DIR, filename)
        if os.path.exists(path):
            os.remove(path)

# --- AI Assistant Endpoint ---
from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

@app.post("/api/chat")
async def chat_assistant(req: ChatRequest):
    """
    Integrates with Gemini via google-genai to provide AI assistance
    for pipeline building and troubleshooting.
    """
    try:
        from google import genai
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            return {"response": "I cannot answer because the GOOGLE_API_KEY environment variable is not set."}
        
        client = genai.Client(api_key=api_key)
        
        # Prepare context
        context = f"The user is asking about their ETL pipeline. Here is the current graph:\nNodes: {len(req.nodes)}\nEdges: {len(req.edges)}\n"
        if len(req.nodes) > 0:
            node_summaries = []
            for n in req.nodes:
                name = n.get("data", {}).get("label", n.get("type", "Node"))
                node_summaries.append(f"- {name} (ID: {n.get('id')})")
            context += "Node List:\n" + "\n".join(node_summaries) + "\n"

        prompt = f"{context}\n\nUser Message: {req.message}"
        
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
        )
        
        return {"response": response.text}
    except Exception as e:
        return {"response": f"AI Error: {str(e)}"}
