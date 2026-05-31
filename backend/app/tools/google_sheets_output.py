import os
import json
import polars as pl
from typing import Dict
from app.tools.base import BaseNode
from app.tools.file_output import verify_safe_file_path

try:
    import gspread
    from google.oauth2.service_account import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials as UserCredentials
except ImportError:
    gspread = None

class GoogleSheetsOutputNode(BaseNode):
    """
    Connects to Google Sheets and writes data.
    Authenticates via a Service Account JSON Key or OAuth 2.0 Desktop Login.
    """

    MANIFEST = {
        "id": "google_sheets_out",
        "name": "Google Sheets Out",
        "description": "Write datasets directly to Google Sheets.",
        "icon": "FileSpreadsheet",
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
                "placeholder": "e.g., OutputData"
            },
            {
                "field": "write_mode",
                "label": "Write Mode",
                "type": "select",
                "options": ["Overwrite", "Append"],
                "default": "Overwrite"
            },
            {
                "field": "auth_help",
                "type": "help_text",
                "content": "<strong>Authentication Required</strong><br/>To write data to Google Sheets, you must upload your Google Credentials via the <strong>Cloud Connectors</strong> button in the top toolbar first."
            }
        ]
    }

    def _get_gspread_client(self):
        if not gspread:
            raise ImportError("Required packages are missing. Please run 'pip install gspread google-auth-oauthlib'.")
            
        GOOGLE_AUTH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.vibe', 'google_auth'))
        token_path = os.path.join(GOOGLE_AUTH_DIR, 'token.json')
        service_account_path = os.path.join(GOOGLE_AUTH_DIR, 'service_account.json')
        
        # Output tool requires full write scopes
        scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        
        creds = None
        if os.path.exists(service_account_path):
            self.log("Authenticating using global Service Account...")
            creds = Credentials.from_service_account_file(service_account_path, scopes=scopes)
        elif os.path.exists(token_path):
            self.log("Authenticating using global OAuth token...")
            creds = UserCredentials.from_authorized_user_file(token_path, scopes)
            if creds and creds.expired and creds.refresh_token:
                self.log("Refreshing expired OAuth token...")
                creds.refresh(Request())
                with open(token_path, 'w') as f:
                    f.write(creds.to_json())
                    
        if creds:
            return gspread.authorize(creds)
        else:
            raise ValueError("Authentication Required: You must configure Google Cloud Integrations in the top toolbar to write to Google Sheets.")

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Google Sheets Output requires an input connection.")
        df = inputs["input"]

        url_or_id = self.parameters.get("spreadsheet_id_or_url", "").strip()
        worksheet_name = self.parameters.get("worksheet_name", "").strip()
        write_mode = self.parameters.get("write_mode", "Overwrite")

        if not url_or_id:
            raise ValueError("Pending Configuration: Please provide a Spreadsheet URL or ID to begin.")

        # Extract ID if URL is provided
        spreadsheet_id = url_or_id
        if "docs.google.com/spreadsheets/d/" in url_or_id:
            spreadsheet_id = url_or_id.split("/d/")[1].split("/")[0]

        try:
            client = self._get_gspread_client()
            
            self.log(f"Opening Spreadsheet ID: {spreadsheet_id}")
            spreadsheet = client.open_by_key(spreadsheet_id)
            
            worksheet = None
            if worksheet_name:
                try:
                    worksheet = spreadsheet.worksheet(worksheet_name)
                    self.log(f"Found existing worksheet: {worksheet_name}")
                except gspread.exceptions.WorksheetNotFound:
                    self.log(f"Worksheet '{worksheet_name}' not found. Creating it...")
                    worksheet = spreadsheet.add_worksheet(title=worksheet_name, rows="100", cols="20")
            else:
                self.log("No worksheet specified, selecting the first tab.")
                worksheet = spreadsheet.sheet1

            self.log(f"Converting DataFrame ({len(df)} rows) to list of values...")
            # Replace nan/nulls with empty strings to avoid JSON errors during upload
            df_filled = df.fill_null("")
            # Get headers
            headers = df_filled.columns
            # Convert rows to list of lists
            values = df_filled.rows()
            
            # Ensure all values are strings or basic types gspread can handle
            safe_values = [[str(item) if item is not None else "" for item in row] for row in values]

            if write_mode == "Overwrite":
                self.log("Clearing existing worksheet data...")
                worksheet.clear()
                self.log("Writing headers and data...")
                worksheet.update(values=[headers] + safe_values, range_name="A1")
            elif write_mode == "Append":
                self.log("Appending data to worksheet...")
                # If the sheet is completely empty, we should write headers first.
                if len(worksheet.get_all_values()) == 0:
                    worksheet.append_row(headers)
                worksheet.append_rows(safe_values)
            else:
                raise ValueError(f"Unknown write mode: {write_mode}")

            self.log(f"Successfully wrote {len(df)} rows to Google Sheets.")
            return df

        except Exception as e:
            error_msg = str(e)
            if "APIError" in error_msg and "403" in error_msg:
                raise RuntimeError("Access Denied: Please ensure the spreadsheet is shared with the Service Account email with Editor access.")
            else:
                raise RuntimeError(f"Google Sheets Error: {error_msg}")
