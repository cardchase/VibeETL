# VibeETL Node Reference Guide

Welcome to the definitive reference for VibeETL's node library! This document explains how every tool works, its parameters, and provides concrete examples you can use to build powerful pipelines.

---

## 📥 In / Out Tools (Data Connectors)

### 1. File Input Node (`fileInput`)
*   **Purpose**: Read and ingest local raw tabular data files (CSV, Excel, JSON).
*   **Parameters**:
    *   `filePath`: Absolute path to your file (e.g., `C:/data/sales.csv`).
    *   `fileType`: Let the engine auto-detect (`auto`), or force a parser (`csv`, `excel`, `pdf`).
*   **Example Use Case**: Need to load a daily sales report? Drop a File Input node, browse to your `report.xlsx`, and instantly see the schema propagate downstream.

### 2. File Output Node (`fileOutput`)
*   **Purpose**: Save processed data back to your local filesystem.
*   **Parameters**:
    *   `outputPath`: Where to save the file (e.g., `C:/data/output.parquet`).
    *   `outputFormat`: Pick between `csv`, `excel`, `parquet`, `json`, `html`.
*   **Example Use Case**: After cleaning your data, you want to archive it compactly. Connect your final node to File Output, select `parquet`, and write millions of rows in milliseconds. 
*   **Pro Tip (Beautiful PDFs)**: VibeETL avoids bloated local PDF libraries. Instead, select **HTML (Interactive)**, open the generated `.html` in Chrome/Edge, and use `Ctrl+P -> Save as PDF` for a stunning report.

### 3. Database Input Node (`databaseInput`)
*   **Purpose**: Execute SQL queries directly against massive relational databases.
*   **Parameters**:
    *   `db_uri`: The connection string (e.g., `postgresql://user:password@localhost:5432/mydb`).
    *   `query`: Your custom SQL query.
*   **Example Use Case**: 
    ```sql
    SELECT customer_id, SUM(total_spent) as ltv 
    FROM orders 
    WHERE status = 'completed' 
    GROUP BY customer_id
    ```

### 4. Database Output Node (`databaseOutput`)
*   **Purpose**: Write your transformed Polars dataframe straight back to a SQL database.
*   **Parameters**:
    *   `db_uri`: Connection string.
    *   `table_name`: Destination table name.
    *   `if_exists`: Choose whether to `replace` the table, `append` rows, or `fail`.
*   **Example Use Case**: Pushing a nightly aggregated metrics table back to your central Postgres data warehouse using `if_exists: replace`.

### 5. Google Sheets Input & Output Nodes
*   **Purpose**: Read and write data directly to live Google Sheets tabs.
*   **Enterprise SSL Proxy Support**: VibeETL natively integrates with your Windows Certificate Store (via `truststore`). If you are behind a strict corporate firewall or MITM proxy (like Zscaler), VibeETL automatically inherits your browser's root certificates to seamlessly authenticate with Google without requiring complex SSL bypasses!
*   **Authentication Setup**: 
    - You only need to set this up **ONCE**! Click the "Cloud Connectors" button in the top toolbar.
    - Upload your Google Cloud `Service Account JSON` or `OAuth 2.0 Client Secret`.
    - **If using a Service Account**: A service account acts like a "robot" user. To read or write to private sheets, you MUST open your Google Sheet, click "Share", and add the Service Account's email address (found inside your JSON file as `client_email`) with Viewer or Editor permissions.
    - **If using an OAuth 2.0 Client Secret**: You will be prompted to "Sign in with Google" via a popup to grant VibeETL access using your own Google account. Note: If your Google Cloud OAuth app is in "Testing" mode (the default), you must go to the Google Cloud Console (APIs & Services > OAuth consent screen) and add your personal email address to the **Test users** list before you can log in.
    - VibeETL securely saves these credentials locally and will use them to authenticate *all* Google nodes automatically.
*   **Parameters**:
    *   `spreadsheet_id_or_url`: Just paste the full `https://docs.google.com/...` URL! 
        - > [!WARNING]
        - > **NATIVE SHEETS ONLY**: The URL must point to a native Google Sheets document. If you uploaded an Excel file (`.xlsx`) to Google Drive, the API will reject it with a `[400]` error. To fix this, open the file in Google Drive, click **File > Save as Google Sheets**, and use the URL of the newly created native sheet!
    *   `worksheet_name`: The exact name of the tab (e.g., `Sheet1`).
*   **Example Use Case**: Reading a collaborative marketing budget sheet, joining it with your database, and writing the variance back to a new `Budget_Variances` tab!

### 6. GCS Input & Output Nodes (`gcs_in` / `gcs_out`)
*   **Purpose**: Stream massive `parquet` or `csv` files directly from Google Cloud Storage buckets into memory without saving them to your local disk first.
*   **Parameters**:
    *   `bucket`: The GCS bucket name (e.g., `my-enterprise-data-lake`).
    *   `path`: The file path inside the bucket (e.g., `2026/05/sales.parquet`).

### 7. Browse Node (`browse`)
*   **Purpose**: The essential debugging window. It displays a live preview of the first 1000 rows and the precise schema metadata.
*   **Example Use Case**: Drop these anywhere in the middle of your pipeline to inspect the data transformation exactly at that step.

### 8. Image Ingest / Captioning Node (`imageCaption`)
*   **Purpose**: Feed local visual media files to a lightweight local ONNX model to generate AI captions offline.
*   **Example Use Case**: Connect a folder of product images to this node to instantly generate textual descriptions for your e-commerce catalog.

---

## 🛠️ Transform & Prep Tools

### 9. Select Node (`select`) - **NEW: Column Rearrangement!**
*   **Purpose**: Keep, drop, rename, and **reorder** your columns.
*   **Features**:
    - Toggle the checkboxes to keep or drop columns.
    - Type in the right-side text boxes to instantly rename columns.
    - 🖱️ **Drag-and-Drop to Reorder**: You can click and drag the grip icon next to any column to rearrange the physical order of the columns as they flow downstream!
*   **Example Use Case**: Your raw data has 50 columns, but you only need `ID` (rename to `Customer_ID`) and `Amount`, and you want `Customer_ID` to be the very first column.

### 10. Filter Node (`filter`)
*   **Purpose**: Branch your pipeline into "True" and "False" streams based on a condition.
*   **Example Use Case**: Filter `Status == "Active"`. The top handle `T` passes active users, while the bottom handle `F` passes deactivated users, allowing you to build two separate downstream workflows simultaneously!

### 11. Formula Compute Node (`formula`)
*   **Purpose**: Evaluate mathematical or string expressions row-by-row.
*   **Example Use Case**: Calculate profit margins by typing `([Revenue] - [Cost]) / [Revenue]` into the expression box.

### 12. Summarize Node (`summarize`)
*   **Purpose**: Group by specific categorical columns and aggregate metrics (Sum, Mean, Count, Max, Min).
*   **Example Use Case**: Group by `Region` and calculate the `Sum` of `Sales` to get total sales per region.

### 13. Pivot & Unpivot Nodes
*   **Purpose**: Reshape data from Long to Wide (Pivot) or Wide to Long (Unpivot).
*   **Example Use Case (Unpivot/Melt)**: You have columns `Jan_Sales`, `Feb_Sales`, `Mar_Sales`. Unpivot them to create a `Month` column and a single `Sales` column for easier charting.

### 14. Data Cleansing Node (`data_cleansing`)
*   **Purpose**: Sanitizes messy data with one click.
*   **Example Use Case**: Check the boxes for `Trim Whitespace` and `Replace Nulls` to instantly fix messy Excel dumps before joining them with pristine database records.

---

## 🔗 Join Tools

### 15. Join Node (`join`)
*   **Purpose**: Horizontally merge two data streams based on a shared Key column (Inner, Left, Outer, Cross).
*   **Example Use Case**: Connect your `Customers` data to the top port (Left) and `Orders` data to the bottom port (Right). Join on `Customer_ID` to see which orders belong to which customers.

### 16. Union Node (`union`)
*   **Purpose**: Vertically stack multiple datasets on top of each other.
*   **Example Use Case**: Appending January's CSV, February's Excel file, and March's Database query into one massive master table. (You can connect an infinite number of wires to the Union input port!)

---

## 🧠 Analysis & AI Tools

### 17. Gemini AI Node (`geminiAI`)
*   **Purpose**: Run Generative AI prompts directly on your tabular data row-by-row.
*   **Example Use Case**: Pass in a `Customer_Feedback` column. Use the prompt: *"Extract the core sentiment (Positive, Neutral, Negative) from this text."* and output it to a new `Sentiment` column.

### 18. Visualize Node (`visualize`)
*   **Purpose**: Render stunning interactive HTML charts (Scatter, Line, Bar, Box) via Plotly.
*   **Example Use Case**: Create a Bar chart of `Region` vs `Total_Sales` and connect the output straight into a File Output node to save it as an interactive web dashboard!

---

## 🐍 The Ultimate Superpower: Python Code Node

The Python Code node is an unrestricted sandbox. It runs in an isolated background process, meaning it has **zero artificial limits** and will never crash the VibeETL server. If there isn't a pre-built node for your use-case, you can just script it!

### **How to Use It:**
1. Your upstream data is automatically injected into the script as a variable named `df` (a Polars DataFrame).
2. Write your custom Python logic.
3. You **must** assign your final tabular result to a variable named `df_out`. VibeETL will extract `df_out` and pass it to downstream nodes.

### **Installing Missing Libraries:**
Because scripts run on your local machine, you have access to your local environment! If you want to use a library like `requests`, `numpy`, or `transformers`, simply install it in your VibeETL backend environment:
```bash
# Open a terminal in the VibeETL/backend folder
pip install requests beautifulsoup4
```

### **Example 1: Fetching Data from an API (Copy-Paste Ready)**
Don't have a connector for a specific web API? Build one instantly!
```python
import polars as pl
import requests

# Fetch live cryptocurrency prices
response = requests.get("https://api.coincap.io/v2/assets?limit=10")
data = response.json()["data"]

# Convert the JSON array into a Polars DataFrame
df_out = pl.DataFrame(data)

# Optional: Clean up the types
df_out = df_out.with_columns(
    pl.col("priceUsd").cast(pl.Float64),
    pl.col("marketCapUsd").cast(pl.Float64)
)
```

### **Example 2: Advanced Text Processing (NLP)**
If you pip-installed `vaderSentiment`, you can run advanced local sentiment analysis without calling cloud AI APIs.
```python
import polars as pl
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

# Assuming your upstream data (df) has a "Review_Text" column
# We will use map_elements to apply the sentiment analyzer row-by-row
def get_compound_score(text):
    if text is None: return 0.0
    return analyzer.polarity_scores(str(text))["compound"]

# Add the new sentiment column
df_out = df.with_columns(
    pl.col("Review_Text").map_elements(get_compound_score, return_dtype=pl.Float64).alias("Sentiment_Score")
)
```

### **Example 3: Nvidia GPU Acceleration (RAPIDS)**
If you have a local Nvidia GPU, you can unleash it. VibeETL’s background process architecture allows you to offload your data directly into GPU VRAM for lightning-fast Machine Learning using Nvidia's RAPIDS libraries (`cudf`, `cuml`).

**Prerequisites**: You must install RAPIDS on your host machine.

```python
import polars as pl
import cudf  # Nvidia GPU DataFrame library
import cuml  # Nvidia GPU Machine Learning library

# 1. Zero-copy offload your Polars data straight into GPU VRAM!
gpu_df = cudf.from_pandas(df.to_pandas())

# 2. Separate features (X) and target (y)
X_train = gpu_df.drop("Is_Fraud", axis=1)
y_train = gpu_df["Is_Fraud"]

# 3. Train a Random Forest Classifier on the GPU 
# This runs orders of magnitude faster than CPU!
gpu_model = cuml.ensemble.RandomForestClassifier(n_estimators=200, max_depth=10)
gpu_model.fit(X_train, y_train)

# 4. Generate predictions
predictions = gpu_model.predict(X_train)
gpu_df["Fraud_Prediction"] = predictions

# 5. Bring the GPU table back to the host system and pass it to VibeETL
df_out = pl.from_pandas(gpu_df.to_pandas())
```

### **Example 4: The Interactive HTML Payload Trick**
If you output a single column named exactly `__vibe_html_payload__`, VibeETL's Data Preview pane will magically render it as a website! You can build beautiful executive dashboards.

```python
import polars as pl

total_rows = df.height if df is not None else 0

# Create a sleek CSS-styled dashboard card
html = f\"\"\"
<div style="padding: 30px; font-family: sans-serif; background: #f8fafc;">
    <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: center; max-width: 300px;">
        <h3 style="color: #64748b; margin: 0; text-transform: uppercase;">Total Rows Processed</h3>
        <p style="color: #3b82f6; font-size: 36px; font-weight: bold; margin: 10px 0 0 0;">{total_rows:,}</p>
    </div>
</div>
\"\"\"

# Output the HTML payload
df_out = pl.DataFrame({"__vibe_html_payload__": [html]})
```

### **Example 5: Audio DSP & Visualizer Prep (Multimodal)**
VibeETL is not just for corporate data. You can process raw audio files, extract their features (like volume amplitude or tempo), and convert them into structured datasets for visualization.

**Prerequisites**: You must install `librosa` and `numpy` (`pip install librosa numpy`).

```python
import polars as pl
import librosa
import numpy as np
import os

# 1. Define the path to your raw audio file
audio_path = "C:/path/to/your/album/track_01.wav"

# 2. Load the audio file using librosa
y, sr = librosa.load(audio_path, sr=None)

# 3. Extract the Volume Envelope (RMS Energy)
frame_length = 2048
hop_length = 512
rms_energy = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

# 4. Generate the corresponding timestamps
frames = range(len(rms_energy))
times = librosa.frames_to_time(frames, sr=sr, hop_length=hop_length)

# 5. Extract the global Tempo (BPM)
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

# 6. Build the Polars DataFrame to pass back to the VibeETL Canvas
df_out = pl.DataFrame({
    "Time_Seconds": times,
    "Volume_RMS": rms_energy,
    "Track_BPM": np.full(len(times), tempo[0]), 
    "Track_Name": np.full(len(times), os.path.basename(audio_path))
})
```

---

## 💾 Autosave & Disaster Recovery

VibeETL features an enterprise-grade, two-tier auto-recovery system designed to ensure **Zero Data Loss**.

### Tier 1: Local Browser Cache (Instant)
Every time you move a node, connect a wire, or change a setting, VibeETL instantly caches your entire canvas to your browser's local storage. If you accidentally refresh the page or close your browser tab, your workflow will immediately restore exactly as you left it the next time you open the app.

### Tier 2: Backend File Backups (Rolling)
Every 2 seconds after you stop making changes, a background network process physically streams your entire workflow to the VibeETL backend server. 

*   **Save Location:** These physical JSON backup files are securely stored on your computer inside the `VibeETL/backend/.autosaves/` directory.
*   **File Naming:** The files are dynamically named using the title of your active tab, followed by a timestamp (e.g., `My_Data_Pipeline_autosave_20260601_151729.json`).
*   **Rolling Backups:** To prevent your hard drive from filling up, the backend maintains a strict rolling limit of the **10 most recent saves**. Older autosaves are automatically deleted.

If you ever suffer a catastrophic browser wipe (e.g., clearing all site data) or want to revert to an older version of your workflow, simply open the `.autosaves` directory and load the JSON file!