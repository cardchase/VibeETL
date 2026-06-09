import os
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

# Global cache for loaded models
_MODEL_CACHE = {}

class ImageCaptionNode(BaseNode):
    MANIFEST = {
        "id": "imageCaption",
        "name": "Image Ingest",
        "category": "inout",
        "icon": "Image",
        "description": "Describe and extract tabular data from images using GPU-accelerated VLM. Supports batching.",
        "ui_schema": [
            {"field": "imagePath", "type": "string", "label": "Image Path or Upload", "default": ""},
            {"field": "modelName", "type": "select", "label": "Vision-Language Model", "options": ["Qwen2-VL 2B (Fast / 4GB VRAM)", "Qwen2-VL 7B (High Quality / 8GB+ VRAM)"], "default": "Qwen2-VL 2B (Fast / 4GB VRAM)"},
            {"field": "execution_mode", "type": "select", "label": "Execution Engine", "options": ["Auto (GPU if available)", "NVIDIA GPU (CUDA)", "CPU Only"], "default": "Auto (GPU if available)"},
            {"field": "gpu_vram", "type": "select", "label": "GPU VRAM Limit", "options": ["2GB", "3GB", "4GB", "5GB", "6GB", "Max Available"], "default": "Max Available"},
            {"field": "precision", "type": "select", "label": "Model Precision", "options": ["FP16 (Fast/Low VRAM)", "FP32 (High VRAM)"], "default": "FP16 (Fast/Low VRAM)"},
            {"field": "customPrompt", "type": "string", "label": "Custom Prompt (VQA)", "default": "Describe this image in extreme detail. If there is text, output it. If there is a table, format it as a markdown table."}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        
        # Determine batch mode vs single image mode
        df_input = list(inputs.values())[0] if inputs else None
        image_paths = []
        
        if df_input is not None and df_input.height > 0:
            # Try to find a column that contains image paths
            col_name = None
            for col in df_input.columns:
                if col in ["ImagePath", "ResolvedPath", "FilePath"]:
                    col_name = col
                    break
            
            if not col_name:
                for col in df_input.columns:
                    if df_input[col].dtype == pl.Utf8:
                        col_name = col
                        break
                        
            if col_name:
                self.log(f"Batch mode: Found {df_input.height} images in column '{col_name}'.")
                image_paths = df_input[col_name].to_list()
        
        if not image_paths:
            img_param = self.parameters.get("imagePath", "").strip()
            if not img_param:
                self.log("Waiting for image input from upstream connection or configuration...")
                return pl.DataFrame({
                    "ImagePath": pl.Series(dtype=pl.Utf8),
                    "ResolvedPath": pl.Series(dtype=pl.Utf8),
                    "Description": pl.Series(dtype=pl.Utf8),
                    "Dimensions": pl.Series(dtype=pl.Utf8),
                    "Format": pl.Series(dtype=pl.Utf8)
                })
            image_paths = [img_param]
            self.log(f"Single image mode: Analyzing {img_param}")

        try:
            import torch
            from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
            from qwen_vl_utils import process_vision_info
            from PIL import Image
        except ImportError:
            self.log("Required ML libraries are missing. Downloading and installing them dynamically... This may take several minutes.")
            import subprocess
            import sys
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "uv"], stdout=subprocess.DEVNULL)
                import site
                user_site = site.getusersitepackages()
                self.log("Installing torch, torchvision, transformers, qwen-vl-utils, accelerate...")
                subprocess.check_call([
                    sys.executable, "-m", "uv", "pip", "install", "--target", user_site,
                    "torch", "torchvision", "transformers", "qwen-vl-utils", "pillow", "accelerate"
                ])
                self.log("Successfully installed ML libraries using uv. Continuing execution...")
                import site
                user_site = site.getusersitepackages()
                if user_site not in sys.path:
                    sys.path.append(user_site)
                import torch
                from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
                from qwen_vl_utils import process_vision_info
                from PIL import Image
            except subprocess.CalledProcessError as e:
                err_msg = f"Failed to dynamically install libraries: {e}"
                self.log(err_msg)
                raise RuntimeError(err_msg)

        try:
            # Configuration
            model_selection = self.parameters.get("modelName", "Qwen2-VL 2B")
            hf_model_id = "Qwen/Qwen2-VL-7B-Instruct" if "7B" in model_selection else "Qwen/Qwen2-VL-2B-Instruct"
            
            device_type = self.parameters.get("execution_mode", "Auto (GPU if available)")
            max_vram = self.parameters.get("gpu_vram", "Max Available")
            precision = self.parameters.get("precision", "FP16 (Fast/Low VRAM)")
            
            torch_dtype = torch.float16 if "FP16" in precision else torch.float32
            
            cache_key = f"{hf_model_id}_{device_type}_{max_vram}_{precision}"
            
            global _MODEL_CACHE
            if cache_key in _MODEL_CACHE:
                self.log(f"Using cached {hf_model_id} model from memory (0ms load latency).")
                model, processor = _MODEL_CACHE[cache_key]
            else:
                self.log(f"Loading {hf_model_id} model (Device: {device_type}, Precision: {precision}, VRAM Limit: {max_vram})...")
                
                # Clear existing models to free memory
                if _MODEL_CACHE:
                    self.log("Unloading previous models from memory to free VRAM/RAM...")
                    _MODEL_CACHE.clear()
                    import gc
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                
                model_kwargs = {
                    "torch_dtype": torch_dtype
                }
                
                if "CPU" in device_type:
                    model_kwargs["device_map"] = "cpu"
                else:
                    model_kwargs["device_map"] = "auto"
                    if "Max Available" not in max_vram:
                        model_kwargs["max_memory"] = {0: max_vram, "cpu": "16GB"}
                        
                model = Qwen2VLForConditionalGeneration.from_pretrained(
                    hf_model_id,
                    **model_kwargs
                )
                
                processor = AutoProcessor.from_pretrained(
                    hf_model_id, 
                    min_pixels=256*28*28, 
                    max_pixels=1024*28*28
                )
                
                _MODEL_CACHE[cache_key] = (model, processor)
                self.log(f"Model successfully loaded into {model.device} and cached globally.")
            
            default_prompt = (
                "Describe this image in extreme detail. "
                "If there is text, output it. "
                "If there is a table, format it as a markdown table. "
                "Format your response exactly like this: "
                "'This is a description of the image: <description>. "
                "This is the text within that image: <text>. "
                "This is the table: <table>.'"
            )
            prompt_text = self.parameters.get("customPrompt", default_prompt)
            if not prompt_text.strip():
                prompt_text = default_prompt
            
            results = []
            
            for idx, img_path in enumerate(image_paths):
                if hasattr(self, 'is_cancelled') and self.is_cancelled():
                    self.log("Execution cancelled by user. Halting VLM ingestion.")
                    raise RuntimeError("Execution cancelled by user.")
                
                # Resolve path
                if not os.path.isabs(img_path):
                    file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", img_path))
                else:
                    file_path = img_path
                    
                if not os.path.exists(file_path):
                    self.log(f"Warning: Image file not found: {file_path}. Skipping.")
                    continue
                    
                self.log(f"Processing image {idx+1}/{len(image_paths)}: {os.path.basename(file_path)}")
                
                abs_path = os.path.abspath(file_path)
                
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "image": f"file://{abs_path}"},
                            {"type": "text", "text": prompt_text}
                        ]
                    }
                ]
                
                text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                image_inputs, video_inputs = process_vision_info(messages)
                
                inputs_tensor = processor(
                    text=[text],
                    images=image_inputs,
                    videos=video_inputs,
                    return_tensors="pt"
                ).to(model.device)
                
                with torch.no_grad():
                    generated_ids = model.generate(**inputs_tensor, max_new_tokens=512)
                    
                generated_ids_trimmed = [
                    out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs_tensor.input_ids, generated_ids)
                ]
                output_text = processor.batch_decode(
                    generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
                )[0]
                
                # Metadata
                try:
                    img = Image.open(file_path)
                    dimensions = f"{img.width}x{img.height}"
                    img_format = img.format or "UNKNOWN"
                except Exception:
                    dimensions = "Unknown"
                    img_format = "Unknown"
                    
                results.append({
                    "ImagePath": img_path,
                    "ResolvedPath": file_path,
                    "Description": output_text.strip(),
                    "Dimensions": dimensions,
                    "Format": img_format
                })
                
            self.log("Inference complete for all images!")
            
            if not results:
                raise RuntimeError("No images were successfully processed.")
                
            return pl.DataFrame(results)

        except Exception as e:
            self.log(f"Error during VLM execution: {str(e)}")
            raise RuntimeError(f"VLM Error: {str(e)}")
