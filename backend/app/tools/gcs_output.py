import json
import tempfile
import os
import polars as pl
from typing import Dict
from app.tools.base import BaseNode

class GCSOutputNode(BaseNode):
    """
    Connects to Google Cloud Storage (GCS) and writes data (CSV, Parquet, JSON).
    Authenticates via a Service Account JSON Key or Application Default Credentials.
    """

    MANIFEST = {
        "id": "gcs_out",
        "name": "GCS Output",
        "description": "Write datasets directly to Google Cloud Storage buckets.",
        "icon": "CloudUpload",
        "category": "cloud",
        "ui_schema": [
            {
                "field": "bucket",
                "label": "GCS Bucket Name",
                "type": "text",
                "default": "",
                "placeholder": "e.g., my-data-bucket"
            },
            {
                "field": "path",
                "label": "File Path in Bucket",
                "type": "text",
                "default": "",
                "placeholder": "e.g., outputs/results.csv"
            },
            {
                "field": "file_format",
                "label": "Output File Format",
                "type": "select",
                "options": ["csv", "parquet", "json"],
                "default": "csv"
            },
            {
                "field": "service_account_path",
                "label": "Service Account Key Path",
                "type": "string",
                "default": "",
                "placeholder": "C:/path/to/credentials.json (Leave blank to use Application Default Credentials)"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if "input" not in inputs:
            raise ValueError("GCS Output requires an input connection.")
        df = inputs["input"]

        bucket = self.parameters.get("bucket", "").strip()
        path = self.parameters.get("path", "").strip()
        file_format = self.parameters.get("file_format", "csv").lower()
        sa_path = self.parameters.get("service_account_path", "").strip()

        if not bucket or not path:
            raise ValueError("Pending Configuration: Please provide a GCS Bucket name and file path to begin.")

        if bucket.startswith("gs://"):
            bucket = bucket[5:]

        gcs_uri = f"gs://{bucket}/{path}"
        self.log(f"Preparing to write {df.height} rows to {gcs_uri} in {file_format.upper()} format")

        storage_options = None

        if sa_path:
            self.log(f"Service Account path provided. Using token-based authentication from {sa_path}.")
            storage_options = {"token": sa_path}
        else:
            self.log("No Service Account path provided. Attempting to use Application Default Credentials or Public access.")
            storage_options = {"token": "anon"}

        try:
            if file_format == "csv":
                df.write_csv(gcs_uri, storage_options=storage_options)
            elif file_format == "parquet":
                df.write_parquet(gcs_uri, storage_options=storage_options)
            elif file_format == "json":
                df.write_ndjson(gcs_uri, storage_options=storage_options)
            else:
                raise ValueError(f"Unsupported file format: {file_format}")

            self.log(f"Successfully wrote data to {gcs_uri}.")
            return df
        except Exception as e:
            error_msg = str(e)
            if "Anonymous caller does not have storage.objects.get access" in error_msg or "RefreshError" in error_msg or "credentials" in error_msg.lower() or "forbidden" in error_msg.lower():
                raise RuntimeError("Access Denied: Please provide a valid Service Account JSON file path or configure Application Default Credentials.")
            elif "not found" in error_msg.lower():
                raise RuntimeError(f"Bucket not found at {gcs_uri}. Please verify the bucket name.")
            else:
                raise RuntimeError(f"Failed to write to GCS: {error_msg}")
