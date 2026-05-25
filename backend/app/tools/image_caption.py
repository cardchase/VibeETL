import os
import numpy as np
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class ImageCaptionNode(BaseNode):
    MANIFEST = {
        "id": "imageCaption",
        "name": "Image Ingest",
        "category": "inout",
        "icon": "Image",
        "description": "Ingest images and generate semantic descriptions using an ONNX Vision model.",
        "ui_schema": [
            {"field": "imagePath", "type": "image_upload", "label": "Image Path or Upload", "default": ""}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        image_path = self.parameters.get("imagePath", "").strip()
        
        # If image_path is a relative path or filename, assume it is in the uploads directory
        if image_path and not os.path.isabs(image_path):
            file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", image_path))
        else:
            file_path = image_path

        self.log(f"Analyzing image: {file_path} (Pure CPU ONNX Runtime)")
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"Image file not found: {file_path}")

        try:
            from PIL import Image
            import onnxruntime as ort
            from transformers import ViTImageProcessor, AutoTokenizer
        except ImportError:
            err_msg = (
                "Required CPU libraries are missing. Please install them by running:\n"
                "pip install onnxruntime numpy pillow transformers huggingface_hub"
            )
            self.log(err_msg)
            raise ImportError(err_msg)

        try:
            # We download the ONNX model files from Hugging Face Hub
            from huggingface_hub import hf_hub_download
            
            self.log("Downloading/Loading lightweight CPU ONNX model files from Hugging Face...")
            repo_id = "fxmarty/vit-gpt2-image-captioning-onnx"  # standard ONNX-exported version of vit-gpt2-image-captioning
            
            # Download encoder and decoder ONNX files
            encoder_path = hf_hub_download(repo_id=repo_id, filename="models/encoder_model.onnx")
            decoder_path = hf_hub_download(repo_id=repo_id, filename="models/decoder_model.onnx")
            
            self.log("Loading ONNX sessions on CPU...")
            # Use CPU execution provider explicitly
            providers = ["CPUExecutionProvider"]
            encoder_session = ort.InferenceSession(encoder_path, providers=providers)
            decoder_session = ort.InferenceSession(decoder_path, providers=providers)
            
            self.log("Loading tokenizer and image preprocessor...")
            model_name = "nlpconnect/vit-gpt2-image-captioning"
            feature_extractor = ViTImageProcessor.from_pretrained(model_name)
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            
            # Load and preprocess image
            img = Image.open(file_path)
            if img.mode != "RGB":
                img = img.convert(mode="RGB")
            
            # Preprocess image into numpy format
            inputs_dict = feature_extractor(images=[img], return_tensors="np")
            pixel_values = inputs_dict["pixel_values"].astype(np.float32)
            
            self.log("Running encoder session on CPU...")
            encoder_outputs = encoder_session.run(None, {"pixel_values": pixel_values})
            last_hidden_state = encoder_outputs[0] # shape [1, 197, 768]
            
            # Greedy search decoding parameters
            bos_token_id = tokenizer.bos_token_id or 50256
            eos_token_id = tokenizer.eos_token_id or 50256
            max_length = 24
            
            # Initialize input_ids with BOS token
            input_ids = np.array([[bos_token_id]], dtype=np.int64)
            
            self.log("Decoding caption tokens step-by-step using ONNX decoder...")
            for step in range(max_length):
                # Run decoder session
                # Note: The decoder ONNX model expects input_ids and encoder_hidden_states
                decoder_outputs = decoder_session.run(None, {
                    "input_ids": input_ids,
                    "encoder_hidden_states": last_hidden_state
                })
                
                # Get the logits for the last generated token
                logits = decoder_outputs[0]  # shape [1, sequence_length, vocab_size]
                next_token_logits = logits[0, -1, :]
                
                # Greedily select the token with highest probability
                next_token_id = int(np.argmax(next_token_logits))
                
                # Append next_token_id to input_ids
                input_ids = np.concatenate([input_ids, np.array([[next_token_id]], dtype=np.int64)], axis=-1)
                
                # If EOS token is generated, break
                if next_token_id == eos_token_id:
                    break
            
            # Decode the generated token ids to get the caption string
            generated_tokens = input_ids[0].tolist()
            description = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
            
            self.log(f"ONNX CPU inference complete. Description: \"{description}\"")
            
            result_df = pl.DataFrame({
                "ImagePath": [image_path],
                "ResolvedPath": [file_path],
                "Description": [description],
                "Dimensions": [f"{img.width}x{img.height}"],
                "Format": [img.format or "PNG"]
            })
            return result_df
            
        except Exception as e:
            self.log(f"ONNX CPU Inference error: {str(e)}")
            raise RuntimeError(f"ONNX model inference failed: {str(e)}")
