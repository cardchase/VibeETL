import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

class CleansingNode(BaseNode):
    MANIFEST = {
        "id": "data_cleansing",
        "name": "Cleanse",
        "category": "prep",
        "icon": "Sparkles",
        "description": "Cleanse data by trimming whitespace, replacing nulls, etc.",
        "ui_schema": [
            {"field": "columns", "type": "column_multi_select", "label": "Columns to Cleanse", "default": []},
            {"field": "replace_nulls_string", "type": "boolean", "label": "Replace Nulls with Blank String (String cols)", "default": False},
            {"field": "replace_nulls_numeric", "type": "boolean", "label": "Replace Nulls with 0 (Numeric cols)", "default": False},
            {"field": "trim_whitespace", "type": "boolean", "label": "Trim Leading/Trailing Whitespace", "default": False},
            {"field": "remove_punctuation", "type": "boolean", "label": "Remove Punctuation", "default": False},
            {"field": "remove_numbers", "type": "boolean", "label": "Remove Numbers", "default": False},
            {"field": "remove_letters", "type": "boolean", "label": "Remove Letters", "default": False},
            {"field": "string_case", "type": "select", "label": "Modify Case", "options": ["None", "Uppercase", "Lowercase", "Titlecase"], "default": "None"}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Input dataframe is missing.")

        cols_to_clean = self.parameters.get("columns", [])
        if not cols_to_clean:
            self.log("No columns selected for cleansing. Returning unmodified.")
            return df
            
        cols_to_clean = [c for c in cols_to_clean if c in df.columns]

        replace_nulls_string = self.parameters.get("replace_nulls_string", False)
        replace_nulls_numeric = self.parameters.get("replace_nulls_numeric", False)
        trim_whitespace = self.parameters.get("trim_whitespace", False)
        remove_punctuation = self.parameters.get("remove_punctuation", False)
        remove_numbers = self.parameters.get("remove_numbers", False)
        remove_letters = self.parameters.get("remove_letters", False)
        string_case = self.parameters.get("string_case", "None")

        res_df = df.clone()
        expressions = []

        for col in cols_to_clean:
            dtype = df.schema[col]
            expr = pl.col(col)
            
            if dtype == pl.Utf8 or dtype == pl.String:
                if replace_nulls_string:
                    expr = expr.fill_null("")
                if trim_whitespace:
                    expr = expr.str.strip_chars()
                if remove_punctuation:
                    expr = expr.str.replace_all(r'[^\w\s]', '')
                if remove_numbers:
                    expr = expr.str.replace_all(r'\d+', '')
                if remove_letters:
                    expr = expr.str.replace_all(r'[a-zA-Z]+', '')
                
                if string_case == "Uppercase":
                    expr = expr.str.to_uppercase()
                elif string_case == "Lowercase":
                    expr = expr.str.to_lowercase()
                elif string_case == "Titlecase":
                    expr = expr.str.to_titlecase()
                
                expressions.append(expr)
                
            elif dtype in [pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.Float32, pl.Float64, pl.Decimal]:
                if replace_nulls_numeric:
                    expr = expr.fill_null(0)
                expressions.append(expr)

        if expressions:
            res_df = res_df.with_columns(expressions)
            self.log(f"Cleansed columns: {cols_to_clean}")

        return res_df
