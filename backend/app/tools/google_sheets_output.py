import os
import json
import polars as pl
from typing import Dict
from app.tools.base import BaseNode

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
                "field": "auth_method",
                "label": "Authentication Method",
                "type": "select",
                "options": ["Service Account", "OAuth 2.0 (Desktop Login)"],
                "default": "Service Account"
            },
            {
                "field": "credentials_path",
                "label": "Credentials File Path",
                "type": "string",
                "default": "",
                "placeholder": "C:/path/to/service_account.json or client_secret.json"
            }
        ]
    }

    def _get_gspread_client(self, auth_method: str, creds_path: str):
        if not gspread:
            raise ImportError("Required packages are missing. Please run 'pip install gspread google-auth-oauthlib'.")
            
        if not creds_path or not os.path.exists(creds_path):
            raise ValueError(f"Credentials file not found at path: {creds_path}")

        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]

        if auth_method == "Service Account":
            self.log(f"Authenticating using Service Account: {creds_path}")
            creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
            return gspread.authorize(creds)
            
        elif auth_method == "OAuth 2.0 (Desktop Login)":
            self.log(f"Authenticating using OAuth 2.0 Client Secret: {creds_path}")
            
            # Use a local token.json next to the client_secret to cache login
            creds_dir = os.path.dirname(os.path.abspath(creds_path))
            token_path = os.path.join(creds_dir, "token.json")
            
            creds = None
            if os.path.exists(token_path):
                self.log("Found existing OAuth token, attempting to reuse...")
                creds = UserCredentials.from_authorized_user_file(token_path, scopes)
                
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    self.log("Refreshing expired OAuth token...")
                    try:
                        creds.refresh(Request())
                    except Exception as e:
                        self.log(f"Failed to refresh token: {e}. Falling back to browser login.")
                        creds = None
                        
                if not creds:
                    self.log("Starting browser popup for Google Login. Please check your web browser...")
                    flow = InstalledAppFlow.from_client_secrets_file(creds_path, scopes)
                    # Run local server for auth callback
                    creds = flow.run_local_server(port=0)
                    
                # Save the credentials for the next run
                with open(token_path, 'w') as token:
                    token.write(creds.to_json())
                    self.log(f"Saved OAuth token to {token_path}")
                    
            return gspread.authorize(creds)
        else:
            raise ValueError(f"Unknown authentication method: {auth_method}")

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("Google Sheets Output requires an input connection.")
        df = inputs["input"]

        url_or_id = self.parameters.get("spreadsheet_id_or_url", "").strip()
        worksheet_name = self.parameters.get("worksheet_name", "").strip()
        write_mode = self.parameters.get("write_mode", "Overwrite")
        auth_method = self.parameters.get("auth_method", "Service Account")
        creds_path = self.parameters.get("credentials_path", "").strip()

        if not url_or_id:
            raise ValueError("Pending Configuration: Please provide a Spreadsheet URL or ID to begin.")

        # Extract ID if URL is provided
        spreadsheet_id = url_or_id
        if "docs.google.com/spreadsheets/d/" in url_or_id:
            spreadsheet_id = url_or_id.split("/d/")[1].split("/")[0]

        try:
            client = self._get_gspread_client(auth_method, creds_path)
            
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
