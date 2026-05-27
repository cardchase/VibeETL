import polars as pl
import pandas as pd
import os

df1 = pl.DataFrame({"a": [1, 2, 3]})
df2 = pl.DataFrame({"b": [4, 5, 6]})

file_path = "test_excel_append.xlsx"

# Write first dataframe
with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
    df1.to_pandas().to_excel(writer, sheet_name="Sheet1", index=False)

# Append second dataframe
with pd.ExcelWriter(file_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
    df2.to_pandas().to_excel(writer, sheet_name="Sheet2", index=False)

print("Exists:", os.path.exists(file_path))
xls = pd.ExcelFile(file_path)
print("Sheets:", xls.sheet_names)
