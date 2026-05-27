import polars as pl
from app.tools.database_output import DatabaseOutputExecutor
from app.tools.database_input import DatabaseInputExecutor
import os

db_uri = f"sqlite:///{os.path.abspath('test_vibe_output.db')}"

# 1. Output to Database
print("Writing to DB...")
df = pl.DataFrame({"A": [1, 2, 3], "B": ["x", "y", "z"]})
output_node = DatabaseOutputExecutor(
    node_id="db_out_1",
    parameters={
        "db_uri": db_uri,
        "table_name": "test_table",
        "if_exists": "replace"
    }
)

output_node.execute({"input": df})
print("Logs:", output_node.logs)

# 2. Read from Database
print("Reading from DB...")
input_node = DatabaseInputExecutor(
    node_id="db_in_1",
    parameters={
        "db_uri": db_uri,
        "query": "SELECT * FROM test_table"
    }
)

df_in = input_node.execute({})
print(df_in)
print("Logs:", input_node.logs)
