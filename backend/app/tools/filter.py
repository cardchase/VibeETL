import re
import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode

def parse_to_polars_str(expr_str: str, schema: Dict[str, Any]) -> str:
    token_specification = [
        ('STRING',   r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\''), # Double or single quoted strings
        ('COLUMN',   r'\[[^\]]+\]'),                             # Bracketed column names [Col]
        ('NUMBER',   r'\d+(?:\.\d+)?'),                         # Integer or decimal number
        ('KEYWORD',  r'\b(?:AND|OR|NOT|IS|NULL|CONTAINS|STARTSWITH|ENDSWITH|TRUE|FALSE)\b'),
        ('OP',       r'==|!=|>=|<=|<>|=|<|>'),                  # Comparison operators
        ('LPAREN',   r'\('),
        ('RPAREN',   r'\)'),
        ('COMMA',    r','),
        ('WS',       r'\s+'),                                    # Whitespace
        ('MISC',     r'.'),                                      # Any other character
    ]
    
    tok_regex = '|'.join(f'(?P<{name}>{pattern})' for name, pattern in token_specification)
    tokens = []
    
    for mo in re.finditer(tok_regex, expr_str, re.IGNORECASE):
        kind = mo.lastgroup
        value = mo.group()
        if kind != 'WS':
            tokens.append((kind, value))
            
    result_parts = []
    i = 0
    n = len(tokens)
    
    def get_cast_val(col_name, val_kind, val_str):
        col_type = schema.get(col_name)
        if col_type == pl.Date:
            if val_kind == 'STRING':
                raw_str = val_str[1:-1]
                return f'pl.lit("{raw_str}").str.to_date()'
        elif col_type == pl.Datetime:
            if val_kind == 'STRING':
                raw_str = val_str[1:-1]
                return f'pl.lit("{raw_str}").str.to_datetime()'
        elif col_type in (pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64, pl.Float32, pl.Float64):
            if val_kind == 'STRING':
                raw_str = val_str[1:-1]
                return raw_str
        return val_str

    while i < n:
        # Contains/StartsWith/EndsWith function call: CONTAINS([Col], "val")
        if (i + 5 < n and 
            tokens[i][0] == 'KEYWORD' and tokens[i][1].upper() in ('CONTAINS', 'STARTSWITH', 'ENDSWITH') and
            tokens[i+1][0] == 'LPAREN' and 
            tokens[i+2][0] == 'COLUMN' and 
            tokens[i+3][0] == 'COMMA' and 
            tokens[i+4][0] == 'STRING' and 
            tokens[i+5][0] == 'RPAREN'):
            
            method = tokens[i][1].lower()
            if method == 'startswith': method = 'starts_with'
            elif method == 'endswith': method = 'ends_with'
            
            col_name = tokens[i+2][1][1:-1]
            str_val = tokens[i+4][1]
            result_parts.append(f'(pl.col("{col_name}").cast(pl.Utf8).str.{method}({str_val}))')
            i += 6
            continue

        # Infix comparison: COLUMN OP VALUE
        if (i + 2 < n and 
            tokens[i][0] == 'COLUMN' and 
            tokens[i+1][0] == 'OP' and 
            tokens[i+2][0] in ('NUMBER', 'STRING', 'KEYWORD')):
            
            col_name = tokens[i][1][1:-1]
            op = tokens[i+1][1]
            if op == '=': op = '=='
            elif op == '<>': op = '!='
            
            val = tokens[i+2][1]
            if val.upper() == 'TRUE': val = 'True'
            elif val.upper() == 'FALSE': val = 'False'
            else:
                val = get_cast_val(col_name, tokens[i+2][0], val)
            
            result_parts.append(f'(pl.col("{col_name}") {op} {val})')
            i += 3
            continue

        # Infix Contains/StartsWith/EndsWith: COLUMN KEYWORD STRING
        if (i + 2 < n and 
            tokens[i][0] == 'COLUMN' and 
            tokens[i+1][0] == 'KEYWORD' and tokens[i+1][1].upper() in ('CONTAINS', 'STARTSWITH', 'ENDSWITH') and
            tokens[i+2][0] == 'STRING'):
            
            col_name = tokens[i][1][1:-1]
            method = tokens[i+1][1].lower()
            if method == 'startswith': method = 'starts_with'
            elif method == 'endswith': method = 'ends_with'
            
            str_val = tokens[i+2][1]
            result_parts.append(f'(pl.col("{col_name}").cast(pl.Utf8).str.{method}({str_val}))')
            i += 3
            continue

        # COLUMN IS NOT NULL
        if (i + 3 < n and 
            tokens[i][0] == 'COLUMN' and 
            tokens[i+1][0] == 'KEYWORD' and tokens[i+1][1].upper() == 'IS' and
            tokens[i+2][0] == 'KEYWORD' and tokens[i+2][1].upper() == 'NOT' and
            tokens[i+3][0] == 'KEYWORD' and tokens[i+3][1].upper() == 'NULL'):
            
            col_name = tokens[i][1][1:-1]
            result_parts.append(f'(pl.col("{col_name}").is_not_null())')
            i += 4
            continue

        # COLUMN IS NULL
        if (i + 2 < n and 
            tokens[i][0] == 'COLUMN' and 
            tokens[i+1][0] == 'KEYWORD' and tokens[i+1][1].upper() == 'IS' and
            tokens[i+2][0] == 'KEYWORD' and tokens[i+2][1].upper() == 'NULL'):
            
            col_name = tokens[i][1][1:-1]
            result_parts.append(f'(pl.col("{col_name}").is_null())')
            i += 3
            continue

        # Default token translation
        kind, val = tokens[i]
        if kind == 'COLUMN':
            result_parts.append(f'pl.col("{val[1:-1]}")')
        elif kind == 'KEYWORD':
            upper_val = val.upper()
            if upper_val == 'AND':
                result_parts.append('&')
            elif upper_val == 'OR':
                result_parts.append('|')
            elif upper_val == 'NOT':
                result_parts.append('~')
            elif upper_val == 'TRUE':
                result_parts.append('True')
            elif upper_val == 'FALSE':
                result_parts.append('False')
            else:
                result_parts.append(val)
        elif kind == 'OP':
            if val == '=':
                result_parts.append('==')
            elif val == '<>':
                result_parts.append('!=')
            else:
                result_parts.append(val)
        else:
            result_parts.append(val)
            
        i += 1
        
    return ' '.join(result_parts)

class FilterNode(BaseNode):
    MANIFEST = {
        "id": "filter",
        "name": "Filter",
        "category": "prep",
        "icon": "Filter",
        "description": "Filter rows by a condition.",
        "ui_schema": [
            {"field": "column", "type": "column_select", "label": "Filter Column", "default": ""},
            {"field": "operator", "type": "select", "label": "Operator", "options": ["==", "!=", ">", "<", ">=", "<=", "contains", "not_contains", "starts_with", "ends_with", "is_null", "is_not_null"], "default": "=="},
            {"field": "value", "type": "string", "label": "Comparison Value", "default": ""}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> Dict[str, pl.DataFrame]:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Filter node requires an incoming data stream.")

        filter_type = self.parameters.get("filterType", "basic")
        
        if filter_type == "custom":
            expr_str = self.parameters.get("customExpression", "").strip()
            if not expr_str:
                self.log("Empty custom filter expression. Passing input data unchanged to True branch.")
                return {"true": df, "false": pl.DataFrame(schema=df.schema)}
            
            self.log(f"Applying custom filter expression: {expr_str}")
            try:
                polars_expr_str = parse_to_polars_str(expr_str, df.schema)
                self.log(f"Compiled Polars expression: {polars_expr_str}")
                
                expr = eval(polars_expr_str, {"pl": pl})
                true_expr_clean = expr.fill_null(False)
                
                true_df = df.filter(true_expr_clean)
                false_df = df.filter(~true_expr_clean)
                
                self.log(f"Custom filter applied. True branch: {true_df.height} rows, False branch: {false_df.height} rows.")
                return {"true": true_df, "false": false_df}
            except Exception as e:
                self.log(f"Error evaluating custom expression '{expr_str}': {e}")
                raise ValueError(f"Invalid custom expression: {expr_str}. Error: {e}")

        # Basic filter execution
        column = self.parameters.get("column", "")
        operator = self.parameters.get("operator", "==")
        value_raw = self.parameters.get("value", "")

        if not column:
            self.log("No column specified for filter. Passing input data unchanged to True branch.")
            return {"true": df, "false": pl.DataFrame(schema=df.schema)}

        if column not in df.columns:
            from app.tools.base import SchemaCompatibilityError
            raise SchemaCompatibilityError(
                f"Schema Compatibility Error in 'filter' node: Required column '{column}' "
                f"is missing from the upstream schema. Available columns are: {df.columns}. "
                f"Please ensure upstream tools output this column before filtering on it."
            )

        self.log(f"Applying basic filter: [{column}] {operator} '{value_raw}'")

        # Cast target value to match the column data type
        col_type = df.schema[column]
        value = value_raw
        
        if operator not in ["is_null", "is_not_null"]:
            if str(value_raw).strip() == "":
                self.log("Warning: Comparison value is empty. Passing all data to true branch.")
                return {"true": df, "false": pl.DataFrame(schema=df.schema)}

            try:
                # Check integer types (both signed and unsigned)
                if col_type in [pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.UInt64, pl.UInt32, pl.UInt16, pl.UInt8]:
                    value = int(value_raw)
                # Check float types
                elif col_type in [pl.Float64, pl.Float32]:
                    value = float(value_raw)
                # Check decimal types
                elif isinstance(col_type, pl.Decimal) or str(col_type).startswith("Decimal"):
                    import decimal
                    value = decimal.Decimal(value_raw)
                # Check boolean type
                elif col_type == pl.Boolean:
                    value = str(value_raw).lower() in ["true", "1", "yes", "t"]
                # Check date / datetime types
                elif col_type == pl.Date:
                    from datetime import datetime
                    value = datetime.strptime(value_raw, "%Y-%m-%d").date()
                elif col_type == pl.Datetime:
                    from datetime import datetime
                    value = datetime.fromisoformat(value_raw)
            except Exception as e:
                self.log(f"Error: Could not cast value '{value_raw}' to {col_type}. Error: {e}")
                raise ValueError(f"Invalid comparison value '{value_raw}' for column '{column}' of type {col_type}. Error: {e}")

        # Apply operators
        if operator == "==":
            true_expr = pl.col(column) == value
        elif operator == "!=":
            true_expr = pl.col(column) != value
        elif operator == ">":
            true_expr = pl.col(column) > value
        elif operator == ">=":
            true_expr = pl.col(column) >= value
        elif operator == "<":
            true_expr = pl.col(column) < value
        elif operator == "<=":
            true_expr = pl.col(column) <= value
        elif operator == "contains":
            true_expr = pl.col(column).cast(pl.Utf8).str.contains(str(value))
        elif operator == "not_contains":
            true_expr = ~pl.col(column).cast(pl.Utf8).str.contains(str(value))
        elif operator == "starts_with":
            true_expr = pl.col(column).cast(pl.Utf8).str.starts_with(str(value))
        elif operator == "ends_with":
            true_expr = pl.col(column).cast(pl.Utf8).str.ends_with(str(value))
        elif operator == "is_null":
            true_expr = pl.col(column).is_null()
        elif operator == "is_not_null":
            true_expr = pl.col(column).is_not_null()
        else:
            raise ValueError(f"Unsupported filter operator: {operator}")

        true_expr_clean = true_expr.fill_null(False)
        
        true_df = df.filter(true_expr_clean)
        false_df = df.filter(~true_expr_clean)

        self.log(f"Filter applied. True branch: {true_df.height} rows, False branch: {false_df.height} rows.")
        return {"true": true_df, "false": false_df}
