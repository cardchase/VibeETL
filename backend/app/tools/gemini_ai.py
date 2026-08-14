import os
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

import sys
import subprocess
import site

class GeminiAINode(BaseNode):
    MANIFEST = {
        "id": "gemini_ai",
        "name": "Gemini AI",
        "category": "analysis",
        "icon": "Sparkles",
        "description": "Use Google's Gemini Generative AI to process data. WARNING: Throwing thousands of rows to the API will hit rate limits or block you. Use wisely on small datasets or after a Filter.",
        "ui_schema": [
            {"field": "input_column", "type": "column_select", "label": "Input Column", "default": ""},
            {"field": "output_column", "type": "column_creatable", "label": "Output Column Name", "default": "AI_Response"},
            {"field": "prompt_template", "type": "textarea", "label": "Prompt (use {ColumnName} to inject data)", "default": "Extract the sentiment from: {Input}"},
            {"field": "api_key", "type": "string", "label": "Gemini API Key (Optional if GEMINI_API_KEY env is set)", "default": ""},
            {"field": "enable_google_search", "type": "boolean", "label": "Enable Web Search (Google Grounding)", "default": False},
            {"field": "bypass_warning", "type": "boolean", "label": "Acknowledge Rate Limits (Bypass >500 Row Warning)", "default": False}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: GeminiAi node requires an incoming data stream.")

        # Dynamically install or upgrade the google-genai library if missing
        try:
            from google import genai
        except ImportError:
            self.log("Installing the latest 'google-genai' SDK in the background...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "uv"], stdout=subprocess.DEVNULL)
            user_site = site.getusersitepackages()
            subprocess.check_call([
                sys.executable, "-m", "uv", "pip", "install", "--target", user_site, "google-genai"
            ])
            if user_site not in sys.path:
                sys.path.append(user_site)
            from google import genai
            self.log("Successfully installed 'google-genai' SDK.")

        input_column = self.parameters.get("input_column", "")
        output_column = self.parameters.get("output_column", "AI_Response")
        prompt_template = self.parameters.get("prompt_template", "Extract the sentiment from: {Input}")
        api_key = self.parameters.get("api_key", "").strip()
        enable_google_search = self.parameters.get("enable_google_search", False)
        bypass_warning = self.parameters.get("bypass_warning", False)

        if not input_column or input_column not in df.columns:
            return self.graceful_bypass(
                df=df,
                missing_cols=[input_column] if input_column else ["<None Specified>"],
                expected_config={'Input Column': input_column or "<None Specified>"}
            )

        # Configure API Key
        key_to_use = api_key if api_key else os.environ.get("GEMINI_API_KEY", "")
        if not key_to_use:
            raise ValueError("Missing Gemini API Key. Provide it in the tool settings or set the GEMINI_API_KEY environment variable.")

        client = genai.Client(api_key=key_to_use)
        model_name = 'gemini-1.5-flash'
        
        # Configure Tools (Google Search Grounding)
        config_kwargs = {}
        if enable_google_search:
            from google.genai import types
            config_kwargs["tools"] = [{"google_search": {}}]
            self.log("🌐 Google Search Grounding is ENABLED. The AI will browse the live web for context.")

        self.log(f"Preparing to run Gemini AI on column '{input_column}' into '{output_column}' for {df.height} rows...")
        
        # Interactive Pause for Rate Limits
        if df.height > 500 and not bypass_warning:
            raise RuntimeError(f"WARNING: You are sending {df.height} rows to the Gemini API, which may hit rate limits. To proceed, please check 'Acknowledge Rate Limits' in the node configuration.")

        # Convert column to python list
        input_data = df[input_column].to_list()
        ai_responses = []

        for idx, val in enumerate(input_data):
            try:
                val_str = str(val)
                # Basic string replacement formatting for prompt
                formatted_prompt = prompt_template.replace("{Input}", val_str).replace(f"{{{input_column}}}", val_str)
                
                # Check for multimodal file processing (Image, Audio, Video)
                if os.path.isfile(val_str):
                    self.log(f"Row {idx}: Detected local file path, uploading to Gemini: {val_str}")
                    uploaded_file = client.files.upload(file=val_str)
                    
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=[formatted_prompt, uploaded_file],
                            config=types.GenerateContentConfig(**config_kwargs) if enable_google_search else None
                        )
                        ai_responses.append(response.text.strip())
                    finally:
                        # Ensure we securely delete the file from Google servers
                        client.files.delete(name=uploaded_file.name)
                else:
                    # Text-only processing
                    response = client.models.generate_content(
                        model=model_name,
                        contents=formatted_prompt,
                        config=types.GenerateContentConfig(**config_kwargs) if enable_google_search else None
                    )
                    ai_responses.append(response.text.strip())

                if idx > 0 and idx % 10 == 0:
                    self.log(f"Processed {idx}/{df.height} rows...")
            except Exception as e:
                self.log(f"Error on row {idx}: {str(e)}")
                ai_responses.append(f"Error: {str(e)}")

        self.log(f"Completed Gemini AI processing for {df.height} rows.")

        res_df = df.with_columns(pl.Series(output_column, ai_responses))
        return res_df
