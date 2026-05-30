# VibeETL Node Reference Guide

### 📖 Reference Examples: How the Built-in Nodes Work

To guide your development, here is a detailed breakdown of how each standard node maps parameters to inputs and outputs:

#### 1. File Input Node (`fileInput`)
*   **Purpose**: Read and ingest raw tabular data files.
*   **Category**: In / Out (`inout`)
*   **Parameters**:
    *   `filePath` (String): The path or filename of the target file.
    *   `fileType` (String): `"auto"`, `"csv"`, `"excel"`, or `"pdf"`.
    *   `detectedSchema` (Array of objects): Caches the column list.
*   **Schema Output**: Dynamically read from the file structure (e.g. `[{"name": "ColA", "type": "String"}, ...]`).

#### 2. Image Ingest / Captioning Node (`imageCaption`)
*   **Purpose**: Feed local visual media files to a lightweight ONNX model on the CPU to generate semantic annotations.
*   **Category**: In / Out (`inout`)
*   **Parameters**:
    *   `imagePath` (String): Local absolute path or uploaded photo filename.
*   **Schema Output**:
    *   Always outputs a fixed schema containing image characteristics:
        *   `ImagePath` (String)
        *   `ResolvedPath` (String)
        *   `Description` (String) - *containing the model's generated caption*
        *   `Dimensions` (String)
        *   `Format` (String)



#### 3. Filter Node (`filter`)
*   **Purpose**: Filter the rows of the dataset using a conditional predicate.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `column` (String): Upstream column name to inspect.
    *   `operator` (String): `"=="`, `"!="`, `">"`, `"<"`, `">="`, `"<="`, `"contains"`.
    *   `value` (String): Operand comparison string/number.
*   **Schema Output**: Passes the exact incoming upstream schema through unchanged.
*   **Note**: Implements **two output handles** (`T` for True matching rows and `F` for False matching rows) allowing for conditional data stream branching.

#### 4. Sort Node (`sort`)
*   **Purpose**: Sort dataset rows using a selected column.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `column` (String): Upstream column name to sort by.
    *   `descending` (Boolean): Sort order direction.
*   **Schema Output**: Passes the incoming upstream schema through unchanged.

#### 5. Select / Rename Node (`select`)
*   **Purpose**: Modify the fields of the schema before passing it subsequent nodes.
*   **Category**: Transform (`transform`)
*   **Parameters**:
    *   `columns` (Array of configs): List of column modifications:
        *   `name` (String): Original column name.
        *   `keep` (Boolean): Toggle column retention.
        *   `rename` (String): New column name (optional).
*   **Schema Output**: Alters the schema by dropping unkept columns and renaming kept columns, passing the updated structure downstream.

#### 6. Browse Node (`browse`)
*   **Purpose**: Terminal inspect window displaying schema profiles and dataframe records.
*   **Category**: In / Out (`inout`)
*   **Parameters**: *None*
*   **Schema Output**: Passes the incoming upstream schema through unchanged.

#### 7. Pivot Node (`pivot`)
*   **Purpose**: Reshapes data from long to wide format by aggregating values.
*   **Category**: Transform (`transform`)
*   **Parameters**:
    *   `index` (Array): Columns to group by.
    *   `columns` (String): Column containing new wide column headers.
    *   `values` (String): Column containing the numerical values to aggregate.
    *   `aggregate_function` (String): `"sum"`, `"mean"`, `"max"`, `"min"`, `"first"`, etc.
*   **Schema Output**: Returns index columns plus dynamic columns determined by the data.

#### 8. Unpivot Node (`unpivot`)
*   **Purpose**: Reshapes data from wide to long format (melting).
*   **Category**: Transform (`transform`)
*   **Parameters**:
    *   `id_vars` (Array): Columns to keep as identifier variables.
    *   `value_vars` (Array): Columns to unpivot (leave empty to unpivot all non-ID vars).
    *   `variable_name` (String): Name for the new column containing the original column headers.
    *   `value_name` (String): Name for the new column containing the values.
*   **Schema Output**: Returns `id_vars`, `variable_name`, and `value_name` columns.

#### 9. Union Node (`union`)
*   **Purpose**: Stacks multiple data streams together into one continuous stream.
*   **Category**: Join (`join`)
*   **Parameters**:
    *   `how` (String): Alignment method (`"vertical"`, `"diagonal"`).
*   **Schema Output**: Takes the union of all connected incoming schemas. Note: The `input` port supports an infinite number of edges!

#### 10. Cleanse Node (`data_cleansing`)
*   **Purpose**: Sanitizes text and null values in datasets.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `columns` (Array): Which columns to apply cleansing to.
    *   `replace_nulls_string` (Boolean): Replaces string nulls with `""`.
    *   `replace_nulls_numeric` (Boolean): Replaces numeric nulls with `0`.
    *   `trim_whitespace` (Boolean): Trims leading/trailing whitespace.
    *   `remove_punctuation` (Boolean): Strips all punctuation characters.
*   **Schema Output**: Passes incoming schema through unchanged.

#### 11. Formula Compute Node (`formula`)
*   **Purpose**: Calculate new columns or overwrite existing ones using expressions.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `output_column` (String): Name of the column to output the calculation to.
    *   `expression` (String): The math/text formula (e.g. `[A] + [B]`).
*   **Schema Output**: Appends the new `output_column` or overwrites its type if it already exists.

#### 12. Unique Node (`unique`)
*   **Purpose**: Deduplicates rows based on a subset of column keys.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `columns` (Array): The columns to determine uniqueness (leave empty for all).
    *   `keep` (String): Which duplicate to retain (`"first"`, `"last"`, `"any"`, `"none"`).
*   **Schema Output**: Passes incoming schema through unchanged.

#### 13. Database Input Node (`databaseInput`)
*   **Purpose**: Read data directly from SQL Databases.
*   **Category**: In / Out (`inout`)
*   **Parameters**:
    *   `db_uri` (String): Connection string (e.g., `postgresql://...`).
    *   `query` (String): The SQL SELECT query.
*   **Schema Output**: Dynamically reads schema from the database query result.

#### 14. Database Output Node (`databaseOutput`)
*   **Purpose**: Write data directly to SQL Databases.
*   **Category**: In / Out (`inout`)
*   **Parameters**:
    *   `db_uri` (String): Connection string.
    *   `table_name` (String): Destination table.
    *   `if_exists` (String): Action if table exists (`replace`, `append`, `fail`).
*   **Schema Output**: Passes incoming schema through unchanged.

#### 15. File Output Node (`fileOutput`)
*   **Purpose**: Save processed data to local files.
*   **Category**: In / Out (`inout`)
*   **Parameters**:
    *   `saveFile` (Boolean): Toggle to actually write to disk.
    *   `outputPath` (String): File path.
    *   `outputFormat` (String): Format (`csv`, `excel`, `parquet`, `json`, `jsonl`, `avro`, `html`).
*   **Schema Output**: Passes incoming schema through unchanged.
*   **Note on PDF Export**: VibeETL avoids installing heavy local PDF binaries. If you need a beautiful PDF report, select **HTML (Interactive)** as your output format. Open the generated `.html` file in your web browser (Chrome/Edge) and simply use `Ctrl+P` -> **Save as PDF**!

#### 16. Record ID Node (`recordId`)
*   **Purpose**: Appends a sequential integer identifier.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `column_name` (String): Output ID column name.
    *   `start_value` (Integer): Starting index.
*   **Schema Output**: Appends the new integer ID column.

#### 17. Regex Node (`regex`)
*   **Purpose**: Parse strings using Regular Expressions.
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `column` (String): Column to parse.
    *   `regex_pattern` (String): The Regex pattern with named capture groups.
*   **Schema Output**: Appends new columns based on regex capture groups.

#### 18. Summarize Node (`summarize`)
*   **Purpose**: Group and aggregate data.
*   **Category**: Transform (`transform`)
*   **Parameters**:
    *   `group_by` (Array): Columns to group by.
    *   `aggregations` (Array): Columns and their functions (`sum`, `mean`, `count`, etc.).
*   **Schema Output**: Groups columns and computes aggregated metrics.

#### 19. Join Node (`join`)
*   **Purpose**: Join two data streams horizontally.
*   **Category**: Join (`join`)
*   **Parameters**:
    *   `how` (String): Join type (`inner`, `left`, `outer`, `cross`).
    *   `left_on` (String): Left key column.
    *   `right_on` (String): Right key column.
*   **Schema Output**: Merges left and right schemas based on the join type.

#### 20. Visualization Node (`visualize`)
*   **Purpose**: Generate interactive HTML plots using Plotly.
*   **Category**: Analysis (`analysis`)
*   **Parameters**:
    *   `plotType` (String): `scatter`, `line`, `bar`, `box`.
    *   `xAxis` (String): X-axis column.
    *   `yAxis` (String): Y-axis column.
    *   `colorBy` (String): Color grouping column.
*   **Schema Output**: Appends a special `__vibe_html_payload__` column containing the rendered plot.

#### 21. Gemini AI Node (`geminiAI`)
*   **Purpose**: Run Generative AI prompts natively in your data pipeline.
*   **Category**: Analysis (`analysis`)
*   **Parameters**:
    *   `system_prompt` (String): Instructions for the AI.
    *   `target_column` (String): Column to process.
    *   `output_column` (String): Name of the generated output.
*   **Schema Output**: Appends the AI response column.

#### 22. Date Time Node (`datetime_parser`)
*   **Purpose**: Parse string columns containing dates/times into strict Datetime objects.
*   **Category**: Transform (`transform`)
*   **Parameters**:
    *   `column` (String): The column to parse.
    *   `format` (String): Optional explicit format string (e.g. `%Y-%m-%d`), or `auto` for inference.
*   **Schema Output**: Modifies the selected column in place to Datetime type.

#### 23. Python Code Node (`python_code`)
*   **Purpose**: Execute custom Python scripts in-memory against the pipeline data.
*   **Category**: Analysis (`analysis`)
*   **Parameters**:
    *   `code` (Textarea): Multiline Python code string. The incoming dataframe is available as `df` and Polars as `pl`.
*   **Schema Output**: Outputs whatever Polars dataframe is assigned to the `df_out` variable in the script.
*   **Note**: This is an extremely powerful "catch-all" node! Users can write custom Python code from scratch to generate brand new dataframes, hit external LLM APIs (like OpenAI or Anthropic), call any external REST APIs, or apply incredibly complex logic that standard nodes do not support.
*   **Capabilities & Limitations**:
    *   **Output MUST be Tabular**: While your code can download images, fetch APIs, or generate videos, the final object returned (`df_out`) MUST be a Polars DataFrame. You cannot output raw images to the canvas; instead, you must output a dataframe that contains the file paths or URLs to those images.
    *   **Third-Party Libraries**: The code runs securely within the VibeETL backend environment. You have access to built-in packages (`json`, `os`, `requests`, `polars`). If you wish to use external libraries (like `cv2` or `transformers`), you must first manually `pip install` them in your backend virtual environment.
    *   **Execution Blocking**: A heavily intensive script (like 4K video processing or a 10-minute ML model training) will block downstream nodes from running until it has fully finished. VibeETL will patiently wait for the script to complete before passing `df_out` to the next node.
    *   **Visual Quirk (The Input Port)**: Because this node can act as both a Transformer (requiring input) and a Generator (requiring no input), its left-side input port will ALWAYS remain visible on the canvas. If you are using it purely as a standalone generator, you can simply ignore the input dot!

#### 24. Sample Records Node (`sampling`)
*   **Purpose**: Extract a subset of records (First N, Last N, or Random).
*   **Category**: Prep (`prep`)
*   **Parameters**:
    *   `sample_type` (String): Extraction method (`first`, `last`, `random`).
    *   `n_records` (Integer): The number of records to extract.
*   **Schema Output**: Passes the incoming upstream schema through unchanged, just reducing the row count.

#### 25. LLM Chunker Node (`llm_chunker`)
*   **Purpose**: Batch sequential rows of text into large prompt chunks for LLMs.
*   **Category**: Analysis (`analysis`)
*   **Parameters**:
    *   `chunk_size` (Integer): The number of sequential rows to group together.
    *   `columns_to_chunk` (Array): Text column(s) to aggregate.
    *   `row_separator` (String): Joining character (e.g., `\n`, `, `).
*   **Schema Output**: Outputs a highly aggregated dataframe with chunk IDs. Each selected column is independently aggregated and retains its original name.

#### 26. GCS Input Node (`gcs_in`)
*   **Purpose**: Read datasets directly from Google Cloud Storage buckets.
*   **Category**: Cloud Connectors (`cloud`)
*   **Parameters**:
    *   `bucket` (String): GCS Bucket Name.
    *   `path` (String): File Path in Bucket.
    *   `file_format` (String): `csv`, `parquet`, or `json`.
    *   `service_account_path` (String): Service Account Key File Path for authentication.
*   **Schema Output**: Dynamically read from the file structure (e.g. `[{"name": "ColA", "type": "String"}, ...]`).

#### 27. GCS Output Node (`gcs_out`)
*   **Purpose**: Write datasets directly to Google Cloud Storage buckets.
*   **Category**: Cloud Connectors (`cloud`)
*   **Parameters**:
    *   `bucket` (String): GCS Bucket Name.
    *   `path` (String): File Path in Bucket.
    *   `file_format` (String): `csv`, `parquet`, or `json`.
    *   `service_account_path` (String): Service Account Key File Path for authentication.
*   **Schema Output**: Passes incoming schema through unchanged.

#### 28. Google Sheets Input Node (`google_sheets_in`)
*   **Purpose**: Read datasets directly from Google Sheets.
*   **Category**: Cloud Connectors (`cloud`)
*   **Parameters**:
    *   `spreadsheet_id_or_url` (String): The full URL or Spreadsheet ID.
    *   `worksheet_name` (String): The tab to read (defaults to the first tab).
    *   `auth_method` (String): `Service Account` or `OAuth 2.0 (Desktop Login)`.
    *   `credentials_path` (String): Path to your `service_account.json` or `client_secret.json`.
*   **Schema Output**: Dynamically read from the Google Sheet.

#### 29. Google Sheets Output Node (`google_sheets_out`)
*   **Purpose**: Write datasets directly to Google Sheets.
*   **Category**: Cloud Connectors (`cloud`)
*   **Parameters**:
    *   `spreadsheet_id_or_url` (String): The full URL or Spreadsheet ID.
    *   `worksheet_name` (String): The tab to write to.
    *   `write_mode` (String): `Overwrite` or `Append`.
    *   `auth_method` (String): `Service Account` or `OAuth 2.0 (Desktop Login)`.
    *   `credentials_path` (String): Path to your `service_account.json` or `client_secret.json`.
*   **Schema Output**: Passes incoming schema through unchanged.

## Google Sheets Input Authentication Notes

**Why is there a cumbersome one-time setup?**
To securely connect to your private Google Sheets, VibeETL requires authentication. Since VibeETL is a local, privacy-first, open-source tool, it does not route your data through a central commercial cloud server (like Zapier or commercial Alteryx). Therefore, it needs its own set of Google Cloud API keys (a client_secret.json or service_account.json) to act on your behalf.

**How to get a Client Secret / Service Account JSON?**
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a New Project.
3. Enable the **Google Sheets API** and **Google Drive API**.
4. Go to **Credentials** -> **Create Credentials**.
   - Choose **OAuth client ID**. 
   - **CRITICAL:** You MUST select **Desktop app** as the Application type! Do NOT select Web application.
   - OR Choose **Service Account** to get an automated headless key.
5. Download the .json key file.

**Managing your Accounts:**
Once uploaded in VibeETL, you can simply click 'Login' to securely fetch your spreadsheets. VibeETL securely remembers your tokens locally.
If you uploaded the wrong JSON file, or want to switch accounts, just click the **Trash** icon next to the "Your Client Secret is saved" text to clear your credentials and start over.

---

## Appendix: Python Node Recipes

Because the Python Code node allows you to run pure Python in the backend, it acts as the ultimate "Catch-all" node. If VibeETL doesn't have a native node for something, you can just script it! Here are some copy-paste recipes for common use cases.

### Recipe 1: Reading Local Files (CSV & Excel)
You can use the Python node as a standalone generator to ingest files from your hard drive that aren't natively supported (like Excel files). Note: Reading Excel requires the `fastexcel` or `openpyxl` library to be installed in your backend environment!

**Reading an Excel File:**
```python
# Make sure to use raw strings (r"") for Windows paths to avoid \u unicode errors!
excel_path = r"G:\My Drive\Projects\VibeETL\backend\uploads\my_data.xlsx"

# Use Polars to read the Excel file directly!
df_out = pl.read_excel(excel_path)
```

**Reading a CSV File:**
```python
csv_path = r"G:\My Drive\Projects\VibeETL\backend\uploads\data_historical.csv"
df_out = pl.read_csv(csv_path)
```

### Recipe 2: The HTML Payload Trick (Multimodal Image Viewer)
If you output a dataframe with a single column named exactly `__vibe_html_payload__`, the VibeETL Data Preview pane will magically render it as a website instead of a table! You can use this to render local images directly in the UI.

```python
import base64

# 1. Grab a local image file path
image_path = r"G:\My Drive\Projects\VibeETL\backend\uploads\Viha 1st bday.JPG"

# 2. Convert it to Base64 so the browser can render it securely
try:
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
        
    # 3. Create a beautiful HTML payload with your image!
    html_string = f\"\"\"
    <div style="text-align: center; padding: 20px; font-family: sans-serif;">
        <h2>📸 Multimodal Media Viewer</h2>
        <img src="data:image/jpeg;base64,{encoded_string}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);" />
        <p>Successfully loaded from your local drive!</p>
    </div>
    \"\"\"
except Exception as e:
    html_string = f"<h2>❌ Failed to load image: {e}</h2>"

# 4. Output the HTML string in the secret `__vibe_html_payload__` column
df_out = pl.DataFrame({"__vibe_html_payload__": [html_string]})
```

### Recipe 3: Executive KPI Dashboard (HTML Payload)
You can aggregate your incoming data and output a gorgeous CSS-styled dashboard instead of a boring grid.

```python
# Assuming you have an incoming `df` connected
total_rows = df.height if df is not None else 15420
revenue = "$1.4M"
status = "Optimal 🟢"

html_string = f\"\"\"
<div style="font-family: sans-serif; display: flex; gap: 20px; justify-content: center; padding: 40px; background-color: #f8fafc;">
    <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; width: 200px;">
        <h3 style="color: #64748b; margin: 0; font-size: 14px; text-transform: uppercase;">Total Processed</h3>
        <p style="color: #0f172a; font-size: 32px; font-weight: bold; margin: 10px 0 0 0;">{total_rows:,}</p>
    </div>
    <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; width: 200px;">
        <h3 style="color: #64748b; margin: 0; font-size: 14px; text-transform: uppercase;">Total Revenue</h3>
        <p style="color: #10b981; font-size: 32px; font-weight: bold; margin: 10px 0 0 0;">{revenue}</p>
    </div>
</div>
\"\"\"
df_out = pl.DataFrame({"__vibe_html_payload__": [html_string]})
```