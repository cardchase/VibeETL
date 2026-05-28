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
    *   `outputFormat` (String): Format (`csv`, `excel`, `parquet`, `json`, `html`).
*   **Schema Output**: Passes incoming schema through unchanged.

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