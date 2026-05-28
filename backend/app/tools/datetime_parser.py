import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode, SchemaCompatibilityError

class DateTimeNode(BaseNode):
    MANIFEST = {
        "id": "datetime",
        "name": "Date Time",
        "category": "transform",
        "icon": "CalendarClock",
        "description": "Parse string fields into DateTime format or format DateTimes to strings.",
        "ui_schema": [
            {"field": "column", "type": "column_select", "label": "Target Column", "default": ""},
            {"field": "action", "type": "select", "label": "Action", "options": [
                "String to Date/Time",
                "Date/Time to String"
            ], "default": "String to Date/Time"},
            {"field": "format", "type": "select", "label": "Format", "options": [
                "Auto-Infer",
                "yyyy-MM-dd",
                "yyyy/MM/dd",
                "dd-MM-yyyy",
                "dd/MM/yyyy",
                "HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss",
                "dd/MM/yyyy HH:mm:ss",
                "Custom"
            ], "default": "Auto-Infer"},
            {"field": "custom_format", "type": "string", "label": "Custom Format (strptime syntax)", "default": ""},
            {"field": "output_column", "type": "string", "label": "New Column Name (leave blank to overwrite)", "default": ""}
        ]
    }

    FORMAT_MAP = {
        "yyyy-MM-dd": "%Y-%m-%d",
        "yyyy/MM/dd": "%Y/%m/%d",
        "dd-MM-yyyy": "%d-%m-%Y",
        "dd/MM/yyyy": "%d/%m/%Y",
        "HH:mm:ss": "%H:%M:%S",
        "yyyy-MM-dd HH:mm:ss": "%Y-%m-%d %H:%M:%S",
        "dd/MM/yyyy HH:mm:ss": "%d/%m/%Y %H:%M:%S"
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        column = self.parameters.get("column", "")
        action = self.parameters.get("action", "String to Date/Time")
        fmt_selection = self.parameters.get("format", "Auto-Infer")
        custom_fmt = self.parameters.get("custom_format", "")
        output_column = self.parameters.get("output_column", "").strip()

        if not column:
            self.log("No column selected. Passing data unchanged.")
            return df

        if column not in df.columns:
            raise SchemaCompatibilityError(
                f"Schema Compatibility Error in 'datetime' node: Column '{column}' "
                f"is missing from upstream schema."
            )

        target_col = output_column if output_column else column

        # Determine the format string
        fmt_str = None
        if fmt_selection == "Custom":
            fmt_str = custom_fmt
        elif fmt_selection in self.FORMAT_MAP:
            fmt_str = self.FORMAT_MAP[fmt_selection]

        try:
            if action == "String to Date/Time":
                if df[column].dtype in (pl.Date, pl.Datetime):
                    self.log(f"Column '{column}' is already Date/Time type. Copying directly.")
                    expr = pl.col(column)
                else:
                    col_expr = pl.col(column).cast(pl.String)
                    if fmt_str:
                        expr = col_expr.str.to_datetime(format=fmt_str, strict=False)
                    else:
                        expr = col_expr.str.to_datetime(strict=False)
                
                df = df.with_columns(expr.alias(target_col))
                self.log(f"Converted '{column}' to DateTime -> '{target_col}' (format: {fmt_str or 'Auto'})")
            
            else: # Date/Time to String
                if df[column].dtype not in (pl.Date, pl.Datetime):
                    self.log(f"Column '{column}' is not a Date/Time type. Casting to string.")
                    expr = pl.col(column).cast(pl.String)
                else:
                    if not fmt_str:
                        fmt_str = "%Y-%m-%d %H:%M:%S" # default fallback for string output
                    expr = pl.col(column).dt.to_string(format=fmt_str)
                df = df.with_columns(expr.alias(target_col))
                self.log(f"Formatted '{column}' to string -> '{target_col}' (format: {fmt_str})")

        except Exception as e:
            self.log(f"Error parsing date/time for column '{column}': {e}")
            raise

        return df
