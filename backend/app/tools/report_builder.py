import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode
import sys
import subprocess
import site

_TEXT_MODEL_CACHE = {}

class ReportBuilderNode(BaseNode):
    MANIFEST = {
        "id": "reportBuilder",
        "name": "Report Builder",
        "category": "reporting",
        "icon": "FileText",
        "description": "Intelligently converts raw or messy text into beautifully styled interactive HTML reports using Local AI.",
        "ui_schema": [
            {"field": "markdownColumn", "type": "column_select", "label": "Text Column Name", "default": "Description"},
            {"field": "formattingEngine", "type": "select", "label": "Formatting Engine", "options": ["Standard Parser (Fast)", "AI Assistant (Intelligent)"], "default": "AI Assistant (Intelligent)"},
            {"field": "aiModel", "type": "select", "label": "AI Model (If Assistant Selected)", "options": ["Qwen2.5-1.5B-Instruct (Recommended)", "Qwen2.5-0.5B-Instruct (Ultra-fast)", "Llama-3.2-1B-Instruct"], "default": "Qwen2.5-1.5B-Instruct (Recommended)"},
            {"field": "execution_mode", "type": "select", "label": "Execution Mode", "options": ["Auto (GPU if available)", "Pure CPU"], "default": "Auto (GPU if available)"},
            {"field": "gpu_vram", "type": "select", "label": "Max GPU VRAM (If Auto)", "options": ["Max Available", "2GB", "4GB", "6GB", "8GB", "12GB", "16GB", "24GB"], "default": "Max Available"},
            {"field": "precision", "type": "select", "label": "Model Precision", "options": ["FP16 (Fast/Low VRAM)", "FP32 (High VRAM)"], "default": "FP16 (Fast/Low VRAM)"},
            {"field": "reportTheme", "type": "select", "label": "Report Theme", "options": ["Light (Elegant)", "Dark (Sleek)"], "default": "Light (Elegant)"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        if not inputs:
            self.log("Waiting for upstream connection...")
            return pl.DataFrame({"__vibe_html_payload__": pl.Series(dtype=pl.Utf8)})
            
        df = list(inputs.values())[0]
        if df is None or df.height == 0:
            self.log("Received empty upstream dataset. Waiting for data...")
            return df.with_columns(pl.Series("__vibe_html_payload__", dtype=pl.Utf8))

        markdown_col = self.parameters.get("markdownColumn", "Description")
        theme = self.parameters.get("reportTheme", "Light (Elegant)")
        engine = self.parameters.get("formattingEngine", "AI Assistant (Intelligent)")

        if markdown_col not in df.columns:
            return self.graceful_bypass(
                df=df,
                missing_cols=[markdown_col],
                expected_config={'Markdown Column': markdown_col}
            )

        # Dynamically install markdown library if missing
        try:
            import markdown
        except ImportError:
            self.log("Installing 'markdown' library for report generation...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "uv"], stdout=subprocess.DEVNULL)
            user_site = site.getusersitepackages()
            subprocess.check_call([
                sys.executable, "-m", "uv", "pip", "install", "--target", user_site, "markdown"
            ])
            if user_site not in sys.path:
                sys.path.append(user_site)
            import markdown
            self.log("Successfully installed 'markdown'.")

        self.log(f"Generating reports for column: '{markdown_col}' using engine '{engine}' and theme '{theme}'...")

        md_series = df[markdown_col].to_list()
        processed_md = []

        if "AI Assistant" in engine:
            import torch
            import gc
            
            model_selection = self.parameters.get("aiModel", "Qwen2.5-1.5B-Instruct (Recommended)")
            device_type = self.parameters.get("execution_mode", "Auto (GPU if available)")
            max_vram = self.parameters.get("gpu_vram", "Max Available")
            precision = self.parameters.get("precision", "FP16 (Fast/Low VRAM)")
            
            hf_model_id = "Qwen/Qwen2.5-1.5B-Instruct"
            if "0.5B" in model_selection:
                hf_model_id = "Qwen/Qwen2.5-0.5B-Instruct"
            elif "Llama-3.2" in model_selection:
                hf_model_id = "meta-llama/Llama-3.2-1B-Instruct"

            torch_dtype = torch.float16 if "FP16" in precision else torch.float32
            
            cache_key = f"{hf_model_id}_{device_type}_{max_vram}_{precision}"
            
            global _TEXT_MODEL_CACHE
            
            try:
                from transformers import AutoModelForCausalLM, AutoTokenizer
                
                if cache_key in _TEXT_MODEL_CACHE:
                    self.log(f"Using cached AI model {hf_model_id} from memory (0ms load latency).")
                    model, tokenizer = _TEXT_MODEL_CACHE[cache_key]
                else:
                    self.log(f"Loading {hf_model_id} AI Formatter (Device: {device_type}, Precision: {precision}, VRAM Limit: {max_vram})...")
                    
                    if _TEXT_MODEL_CACHE:
                        self.log("Unloading previous AI models from memory to free VRAM/RAM...")
                        _TEXT_MODEL_CACHE.clear()
                        gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                    
                    model_kwargs = {"torch_dtype": torch_dtype}
                    
                    if "CPU" in device_type:
                        model_kwargs["device_map"] = "cpu"
                    else:
                        model_kwargs["device_map"] = "auto"
                        if "Max Available" not in max_vram:
                            model_kwargs["max_memory"] = {0: max_vram, "cpu": "16GB"}
                            
                    model = AutoModelForCausalLM.from_pretrained(hf_model_id, **model_kwargs)
                    tokenizer = AutoTokenizer.from_pretrained(hf_model_id)
                    
                    _TEXT_MODEL_CACHE[cache_key] = (model, tokenizer)
                    self.log(f"AI Formatter successfully loaded into {model.device} and cached globally.")

                for idx, text in enumerate(md_series):
                    if not text:
                        processed_md.append("")
                        continue

                    self.log(f"AI intelligently formatting row {idx + 1} / {len(md_series)}...")
                    
                    system_prompt = (
                        "You are an expert document formatter. The user will provide raw, unstructured text from an OCR or Vision model. "
                        "Your job is to restructure this text into a pristine, beautiful Markdown report. "
                        "You MUST fix any broken or single-line tables and ensure they use proper multi-line Markdown table syntax. "
                        "Add nice headers, bold text where appropriate, and clean bullet points. Only output the markdown, no other conversation."
                    )
                    
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Format this raw text into a beautiful markdown report:\n\n{text}"}
                    ]
                    
                    text_input = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                    model_inputs = tokenizer([text_input], return_tensors="pt").to(model.device)
                    
                    generated_ids = model.generate(
                        **model_inputs,
                        max_new_tokens=1024,
                        temperature=0.3,
                        do_sample=True
                    )
                    generated_ids = [
                        output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
                    ]
                    
                    response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
                    processed_md.append(response)
                    self.log(f"Formatting complete for row {idx + 1}.")
                    
            except Exception as e:
                self.log(f"AI Formatting failed: {e}")
                raise RuntimeError(f"AI Formatting error: {e}")
                
        else:
            self.log("Standard Parser selected. Bypassing AI formatting.")
            processed_md = [str(text) if text else "" for text in md_series]

        # Beautiful Tailwind-inspired CSS templates
        light_css = """
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; background-color: #f8fafc; margin: 0; padding: 2rem; }
                .report-container { max-width: 800px; margin: 0 auto; background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                h1, h2, h3, h4, h5, h6 { color: #0f172a; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
                h1 { font-size: 2.25rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
                h2 { font-size: 1.5rem; }
                p { margin-bottom: 1.25em; }
                table { width: 100%; border-collapse: collapse; margin-top: 1.5em; margin-bottom: 1.5em; font-size: 0.95rem; }
                th { background-color: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 0.75rem 1rem; border-bottom: 2px solid #cbd5e1; }
                td { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; color: #334155; }
                tr:hover { background-color: #f8fafc; }
                code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: #f1f5f9; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.875em; color: #ef4444; }
                pre { background-color: #1e293b; color: #f8fafc; padding: 1rem; border-radius: 8px; overflow-x: auto; }
                pre code { background-color: transparent; color: inherit; padding: 0; }
                blockquote { border-left: 4px solid #3b82f6; background-color: #eff6ff; margin: 0; padding: 1rem 1.5rem; color: #1e3a8a; border-radius: 0 8px 8px 0; }
                img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); margin: 1.5em 0; }
            </style>
        """

        dark_css = """
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #0f172a; margin: 0; padding: 2rem; }
                .report-container { max-width: 800px; margin: 0 auto; background: #1e293b; padding: 3rem; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.25); border: 1px solid #334155; }
                h1, h2, h3, h4, h5, h6 { color: #f8fafc; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
                h1 { font-size: 2.25rem; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }
                h2 { font-size: 1.5rem; }
                p { margin-bottom: 1.25em; }
                table { width: 100%; border-collapse: collapse; margin-top: 1.5em; margin-bottom: 1.5em; font-size: 0.95rem; }
                th { background-color: #0f172a; color: #94a3b8; font-weight: 600; text-align: left; padding: 0.75rem 1rem; border-bottom: 2px solid #475569; }
                td { padding: 0.75rem 1rem; border-bottom: 1px solid #334155; color: #cbd5e1; }
                tr:hover { background-color: #0f172a; }
                code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: #0f172a; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.875em; color: #38bdf8; }
                pre { background-color: #000000; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid #334155; }
                pre code { background-color: transparent; color: inherit; padding: 0; }
                blockquote { border-left: 4px solid #3b82f6; background-color: #172554; margin: 0; padding: 1rem 1.5rem; color: #bfdbfe; border-radius: 0 8px 8px 0; }
                img { max-width: 100%; height: auto; border-radius: 8px; margin: 1.5em 0; border: 1px solid #334155; }
            </style>
        """

        css_to_use = dark_css if "Dark" in theme else light_css
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            {css}
        </head>
        <body>
            <div class="report-container">
                {content}
            </div>
        </body>
        </html>
        """

        md_converter = markdown.Markdown(extensions=['tables', 'fenced_code'])

        html_payloads = []
        for idx, text in enumerate(processed_md):
            if not text:
                html_payloads.append("")
                continue
                
            html_content = md_converter.convert(text)
            
            # Wrap in the beautiful template
            full_html = html_template.format(css=css_to_use, content=html_content)
            html_payloads.append(full_html)
            
        self.log(f"Successfully compiled {len(html_payloads)} Markdown reports into styled HTML.")

        # Add the __vibe_html_payload__ column which is magically recognized by the Browse node
        return df.with_columns(pl.Series("__vibe_html_payload__", html_payloads))
