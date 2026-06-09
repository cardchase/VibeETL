# VibeETL Batch Processing Tools Reference

This document explains the architecture and usage of the batch processing tools in VibeETL.

## 1. Folder Input Tool (`folder_input.py`)
**Purpose**: Scans a local directory and outputs a list of all files found within it.
- **Input**: A local directory path (e.g., `C:\data\wallpapers`).
- **Output**: A Polars DataFrame with columns: `FilePath`, `FileName`, `Extension`, `Size`.
- **Usage**: Use this as the starting node for any batch processing pipeline. It acts as the "Directory Tool".

## 2. Dynamic Input Tool (`dynamic_input.py`)
**Purpose**: Reads a batch of standard data files (CSV, Excel) and dynamically merges them into a single dataset.
- **Input**: Requires an upstream connection that provides a DataFrame containing a `FilePath` or `ResolvedPath` column (typically fed from `Folder Input`).
- **Output**: A single merged Polars DataFrame containing all data from all files.
- **Architecture**: 
  - It iterates over the file paths and attempts to auto-detect the file type.
  - **Schema Alignment**: If a `Reference File Path` is specified, the tool extracts the schema of the reference file first. During batch processing, it logs warnings if incoming files have missing or extra columns compared to the reference.
  - If **Strict (Align to Reference)** is selected, the tool drops any extra columns and pads missing columns with nulls, ensuring the data perfectly matches the reference structure.
  - Finally, it uses `pl.concat([dfs], how="diagonal")` to seamlessly merge all files together.
- **Warning**: Do not feed image files (PNG, JPG) into this tool. It is strictly for tabular data files.

## 3. Image Ingest Tool (`image_caption.py`)
**Purpose**: Analyzes images using Vision-Language Models (VLMs) like Qwen2-VL.
- **Single Mode**: If no upstream connection is present, it reads the image specified in its configuration panel.
- **Batch Mode**: If an upstream connection provides a DataFrame with a `FilePath` column (e.g., fed directly from `Folder Input`), it automatically iterates over all file paths, analyzes them sequentially, and outputs a combined DataFrame of the results.
- **Pipeline Architecture**: For processing a folder of images, wire `Folder Input` -> `Image Ingest`. (Do not put `Dynamic Input` in between).
