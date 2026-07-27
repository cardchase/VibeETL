import polars as pl
from typing import Dict, Any
from tabulate import tabulate
from app.tools.base import BaseNode

class TransposeNode(BaseNode):
    MANIFEST = {
        "id": "transpose",
        "name": "Transpose",
        "category": "transform",
        "icon": "LayoutGrid",
        "description": "Transposes the dataset (rotates rows to columns). By default, it takes the entire table and creates a 'Header' and 'Value' column. If you select Key Columns, those columns remain intact as row identifiers.",
        "ui_schema": [
            {"field": "id_vars", "type": "column_multi_select", "label": "Key Columns to keep (Optional)", "default": []},
            {"field": "value_vars", "type": "column_multi_select", "label": "Columns to transpose (Optional: defaults to all)", "default": []},
            {"field": "variable_name", "type": "text", "label": "Name for the new 'Headers' column", "default": "Header"},
            {"field": "value_name", "type": "text", "label": "Name for the new 'Values' column", "default": "Value"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Transpose node requires an incoming data stream.")

        if df.height == 0 or df.width == 0:
            self.log("Empty input DataFrame received. Returning empty result.")
            return df

        id_vars = self.parameters.get("id_vars", []) or []
        value_vars = self.parameters.get("value_vars", []) or []
        variable_name = self.parameters.get("variable_name", "Header") or "Header"
        value_name = self.parameters.get("value_name", "Value") or "Value"

        # Validate key columns exist in DataFrame
        valid_id_vars = [c for c in id_vars if c in df.columns]

        # Determine value columns to transpose
        if value_vars:
            valid_value_vars = [c for c in value_vars if c in df.columns and c not in valid_id_vars]
        else:
            valid_value_vars = [c for c in df.columns if c not in valid_id_vars]

        if not valid_value_vars:
            raise ValueError("No valid columns selected to transpose.")

        self.log(f"Transposing dataset ({df.height} rows x {df.width} cols). Key columns: {valid_id_vars}, Data columns: {len(valid_value_vars)}")

        # Step 1: Safely cast data columns to String (pl.Utf8) to allow mixed-type columns in single Value column
        cast_exprs = [pl.col(c).cast(pl.Utf8).alias(c) for c in valid_value_vars]
        df_prepared = df.with_columns(cast_exprs)

        try:
            # Step 2: Handle case with NO key columns
            if not valid_id_vars:
                if df.height == 1:
                    # Single row transpose: Output is Header | Value
                    res_df = df_prepared.select(valid_value_vars).unpivot(
                        variable_name=variable_name,
                        value_name=value_name
                    )
                else:
                    # Multi-row transpose without explicit keys: Add a record index column
                    df_indexed = df_prepared.with_columns(pl.Series("Record_ID", [f"Record_{i+1}" for i in range(df.height)]))
                    res_df = df_indexed.unpivot(
                        index=["Record_ID"],
                        on=valid_value_vars,
                        variable_name=variable_name,
                        value_name=value_name
                    )
            else:
                # Key columns present
                res_df = df_prepared.unpivot(
                    index=valid_id_vars,
                    on=valid_value_vars,
                    variable_name=variable_name,
                    value_name=value_name
                )
        except Exception as e:
            raise ValueError(f"Transpose execution failed: {str(e)}")

        # Log formatted table preview using tabulate
        if res_df.height > 0:
            preview_rows = res_df.head(10).to_dicts()
            headers = list(preview_rows[0].keys())
            table_data = [[r.get(h) for h in headers] for r in preview_rows]
            table_str = tabulate(table_data, headers=headers, tablefmt="grid")
            self.log(f"Transposed successfully into {res_df.height} rows x {res_df.width} cols:\n{table_str}")
        else:
            self.log("Transposed result has 0 rows.")

        return res_df
