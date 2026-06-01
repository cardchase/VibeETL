import os
import json
import polars as pl
from typing import Dict
from app.tools.base import BaseNode

GOOGLE_AUTH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.vibe', 'google_auth'))

try:
    import gspread
    from google.oauth2.service_account import Credentials as ServiceAccountCredentials
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials as UserCredentials
except ImportError:
    gspread = None

class GoogleSheetsInputNode(BaseNode):
    """
    Connects to Google Sheets and reads data.
    Authenticates via global credentials configured in the UI.
    """

    MANIFEST = {
        "id": "google_sheets_in",
        "name": "Google Sheets In",
        "description": "Read datasets directly from Google Sheets.",
        "icon": "Table",
        "category": "cloud",
        "ui_schema": [
            {
                "field": "spreadsheet_id_or_url",
                "label": "Spreadsheet URL or ID",
                "type": "text",
                "default": "",
                "placeholder": "e.g., https://docs.google.com/spreadsheets/d/1Bxi... or just the ID"
            },
            {
                "field": "worksheet_name",
                "label": "Worksheet (Tab) Name",
                "type": "text",
                "default": "",
                "placeholder": "Select from dropdown"
            },
            {
                "field": "auth_help",
                "type": "help_text",
                "content": "<strong>Private Sheets require Authentication!</strong><br/>If you are accessing a private spreadsheet, you must upload your Google Credentials via the <strong>Cloud Connectors</strong> button in the top toolbar first.<br/><br/><strong>Important:</strong> If using a Service Account, remember to open your Google Sheet, click 'Share', and add the Service Account's email address (found in your JSON file) as a Viewer."
            }
        ]
    }

    def _get_gspread_client(self):
        if not gspread:
            raise ImportError("Required packages are missing. Please run 'pip install gspread google-auth-oauthlib'.")
            
        token_path = os.path.join(GOOGLE_AUTH_DIR, 'token.json')
        service_account_path = os.path.join(GOOGLE_AUTH_DIR, 'service_account.json')
        scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
        
        creds = None
        if os.path.exists(service_account_path):
            self.log("Authenticating using global Service Account...")
            creds = ServiceAccountCredentials.from_service_account_file(service_account_path, scopes=scopes)
        elif os.path.exists(token_path):
            self.log("Authenticating using global OAuth token...")
            creds = UserCredentials.from_authorized_user_file(token_path, scopes)
            if creds and creds.expired and creds.refresh_token:
                self.log("Refreshing expired OAuth token...")
                creds.refresh(Request())
                with open(token_path, 'w') as f:
                    f.write(creds.to_json())
                    
        # Return client. If no creds, it will try to access public sheets.
        if creds:
            import requests
            import warnings
            from urllib3.exceptions import InsecureRequestWarning
            warnings.simplefilter('ignore', InsecureRequestWarning)
            
            # ULTIMATE BYPASS: Globally disable SSL verification for all requests.Session calls.
            # This forces google-auth's internal token refresh to bypass Zscaler.
            if not getattr(requests.Session, '_vibe_ssl_patched', False):
                old_request = requests.Session.request
                def new_request(self, method, url, **kwargs):
                    kwargs['verify'] = False
                    return old_request(self, method, url, **kwargs)
                requests.Session.request = new_request
                requests.Session._vibe_ssl_patched = True
            
            client = gspread.authorize(creds)
            return client
        else:
            raise ValueError("Authentication Required: Please login to Google Sheets in the configuration panel to fetch your spreadsheets.")

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        url_or_id = self.parameters.get("spreadsheet_id_or_url", "").strip()
        worksheet_name = self.parameters.get("worksheet_name", "").strip()

        if not url_or_id:
            self.log("Pending Configuration: Please provide a Spreadsheet URL or ID to begin.")
            return pl.DataFrame()

        spreadsheet_id = url_or_id
        if "docs.google.com/spreadsheets/d/" in url_or_id:
            spreadsheet_id = url_or_id.split("/d/")[1].split("/")[0]

        try:
            client = self._get_gspread_client()
        except Exception as e:
            self.log(f"Authentication setup failed: {str(e)}")
            self.log("Attempting to fetch as a public sheet anonymously...")
            public_csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv"
            if worksheet_name:
                self.log("Note: Anonymous access fetches the default tab. (Cannot select by name without API credentials).")
            try:
                import pandas as pd
                df = pd.read_csv(public_csv_url)
                self.log("Successfully fetched public sheet anonymously!")
                return pl.from_pandas(df)
            except Exception as pub_e:
                self.log(f"Export URL failed (often due to 'downloads disabled' on public sheets). Trying Google Viz API fallback...")
                gviz_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv"
                if worksheet_name:
                    gviz_url += f"&sheet={worksheet_name}"
                try:
                    import pandas as pd
                    df = pd.read_csv(gviz_url)
                    self.log("SUCCESS: Fetched public sheet anonymously via Google Viz API.")
                    self.log("⚠️ WARNING: The Google Viz API tries to infer column data types. Highly irregular sheets with mixed types (like merged headers above data rows) will have rows DROPPED or TRUNCATED. To bypass this and fetch 100% of raw data, please Authenticate Google Sheets in the top toolbar.")
                    return pl.from_pandas(df)
                except Exception as gviz_e:
                    raise RuntimeError("Failed to access sheet. The sheet is likely private. Please upload Google Credentials via the Cloud Connectors button, and ensure you've shared the sheet with your service account email.")
        
        try:
            self.log(f"Opening Spreadsheet ID: {spreadsheet_id}")
            spreadsheet = client.open_by_key(spreadsheet_id)
            
            if worksheet_name:
                self.log(f"Selecting Worksheet: {worksheet_name}")
                worksheet = spreadsheet.worksheet(worksheet_name)
            else:
                self.log("No worksheet specified, selecting the first tab.")
                worksheet = spreadsheet.sheet1
                
            self.log("Downloading data from Google Sheets...")
            all_values = worksheet.get_all_values()
            
            if not all_values:
                self.log("Warning: The worksheet is empty.")
                return pl.DataFrame()
                
            headers = all_values[0]
            data_rows = all_values[1:]
            
            self.log(f"Converting {len(data_rows)} rows to Polars DataFrame...")
            df = pl.DataFrame(data_rows, schema=headers, orient="row")
            
            self.log(f"Successfully read {len(df)} rows from Google Sheets.")
            return df
            
        except Exception as e:
            error_msg = str(e)
            if "APIError" in error_msg and ("403" in error_msg or "404" in error_msg):
                raise RuntimeError("Access Denied (403/404): Your Service Account or OAuth credentials do not have permission to view this sheet. You must open your Google Sheet, click 'Share', and add your Service Account email as a Viewer.")
            elif "APIError" in error_msg and "400" in error_msg and "not be an Office file" in error_msg:
                raise RuntimeError("Google Sheets API Error: The provided URL points to an uploaded Office file (like .xlsx) rather than a native Google Sheet. Please open the file in Google Drive, click 'File > Save as Google Sheets', and use the URL of the new native sheet.")
            elif "WorksheetNotFound" in error_msg:
                raise RuntimeError(f"Worksheet '{worksheet_name}' not found in the spreadsheet.")
            else:
                raise RuntimeError(f"Google Sheets Error: {error_msg}")
