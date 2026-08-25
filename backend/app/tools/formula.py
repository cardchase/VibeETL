import polars as pl
import re
import ast
import datetime
from typing import Dict, Any
from app.tools.base import BaseNode, SecurityError

def parse_formula_to_polars(expression_str: str) -> str:
    """
    Parses nested Alteryx-style conditional expressions into Polars syntax.
    Safely handles string literals by masking them before structural parsing.
    """
    polars_str = expression_str

    # 1. Mask String Literals to protect keywords inside quotes
    string_map = {}
    def mask_strings(match):
        placeholder = f"__STR_{len(string_map)}__"
        string_map[placeholder] = match.group(0)
        return placeholder
    
    # Matches both single and double-quoted strings
    polars_str = re.sub(r'(".*?"|\'.*?\')', mask_strings, polars_str)

    # 2. Translate Columns: [Column Name] -> pl.col("Column Name")
    def replace_bracket(match):
        col_name = match.group(1).replace('"', '\\"')
        return f'pl.col("{col_name}")'
    polars_str = re.sub(r'\[(.*?)\]', replace_bracket, polars_str)

    # 3. Null Checks (Mapped to Polars methods)
    polars_str = re.sub(r'(pl\.col\("[^"]+"\))\s+IS\s+NOT\s+NULL', r'\1.is_not_null()', polars_str, flags=re.IGNORECASE)
    polars_str = re.sub(r'(pl\.col\("[^"]+"\))\s+IS\s+NULL', r'\1.is_null()', polars_str, flags=re.IGNORECASE)

    # 4. Resolve Nested Conditionals (Innermost-Outward Replacement)
    while True:
        ifs = list(re.finditer(r'\bIF\b', polars_str, flags=re.IGNORECASE))
        if not ifs:
            break
        
        # Target the innermost IF block
        last_if = ifs[-1]
        start_idx = last_if.start()
        
        endifs = list(re.finditer(r'\bENDIF\b', polars_str[start_idx:], flags=re.IGNORECASE))
        if not endifs:
            raise ValueError("Syntax Error: Missing ENDIF for an IF statement.")
        
        end_idx = start_idx + endifs[0].end()
        inner_block = polars_str[start_idx:end_idx]
        
        # Strip IF and ENDIF boundaries
        core = inner_block[2:-5].strip()
        
        # Isolate the ELSE fallback
        else_parts = re.split(r'\bELSE\b', core, flags=re.IGNORECASE)
        else_val = else_parts[1].strip() if len(else_parts) > 1 else "None"
        
        # Split remaining conditions by ELSEIF
        branches = re.split(r'\bELSEIF\b', else_parts[0], flags=re.IGNORECASE)
        
        parsed_chain = ""
        for i, branch in enumerate(branches):
            cond_val = re.split(r'\bTHEN\b', branch, flags=re.IGNORECASE)
            if len(cond_val) != 2:
                raise ValueError(f"Syntax error in conditional branch: {branch}")
            
            cond, val = cond_val[0].strip(), cond_val[1].strip()
            if i == 0:
                parsed_chain += f"pl.when({cond}).then({val})"
            else:
                parsed_chain += f".when({cond}).then({val})"
        
        parsed_chain += f".otherwise({else_val})"
        
        # Inject the compiled Polars chain back into the main string
        polars_str = polars_str[:start_idx] + f"({parsed_chain})" + polars_str[end_idx:]

    # 5. Logical Operators
    polars_str = re.sub(r'\bAND\b', '&', polars_str, flags=re.IGNORECASE)
    polars_str = re.sub(r'\bOR\b', '|', polars_str, flags=re.IGNORECASE)

    # 6. Unmask String Literals
    for placeholder, original_str in string_map.items():
        polars_str = polars_str.replace(placeholder, original_str)

    return polars_str

def verify_safe_formula_expression(polars_str: str) -> None:
    forbidden_calls = {'eval', 'exec', 'open', 'compile', '__import__', 'os', 'subprocess', 'shutil', 'requests'}
    try:
        tree = ast.parse(polars_str, mode='eval')
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr.startswith('__'):
                raise SecurityError(f"Restricted attribute access: '{node.attr}'")
            if isinstance(node, ast.Name) and (node.id in forbidden_calls or node.id.startswith('__')):
                raise SecurityError(f"Restricted execution call: '{node.id}'")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                raise SecurityError(f"Restricted function call: '{node.func.id}'")
    except SyntaxError:
        raise ValueError(f"Malformed expression syntax: {polars_str}")

class FormulaNode(BaseNode):
    MANIFEST = {
        "id": "formula",
        "name": "Formula",
        "category": "prep",
        "icon": "Calculator",
        "description": "Compute columns using sequential expressions and conditional logic.",
        "ui_schema": [
            {
                "field": "formulas", 
                "type": "formula_array", 
                "label": "Formulas", 
                "default": [{"output_column": "NewColumn", "expression": "", "data_type": "String"}]
            }
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Formula node requires an incoming data stream.")

        formulas = self.parameters.get("formulas", [])
        res_df = df

        TYPE_MAP = {
            'String': pl.Utf8,
            'Int64': pl.Int64,
            'Float64': pl.Float64,
            'Boolean': pl.Boolean
        }

        # Define all allowed custom ETL functions that map to Polars expressions natively.
        # This completely bypasses brittle regex parentheses matching for nested function calls.
        ETL_CONTEXT = {
            "pl": pl,
            "__builtins__": {},
            "Contains": lambda col, val: col.str.contains(val),
            "StartsWith": lambda col, val: col.str.starts_with(val),
            "EndsWith": lambda col, val: col.str.ends_with(val),
            "Regex_Match": lambda col, pat: col.str.contains(pat),
            "Regex_Replace": lambda col, pat, rep: col.str.replace_all(pat, rep),
            "Regex_Extract": lambda col, pat: col.str.extract(pat),
            "Replace": lambda col, old, new: col.str.replace_all(old, new, literal=True),
            "Uppercase": lambda col: col.str.to_uppercase(),
            "Upper": lambda col: col.str.to_uppercase(),
            "Lowercase": lambda col: col.str.to_lowercase(),
            "Lower": lambda col: col.str.to_lowercase(),
            "Length": lambda col: col.str.len_chars(),
            "Trim": lambda col: col.str.strip_chars(),
            "ToString": lambda col: col.cast(pl.Utf8),
            "ToNumber": lambda col: col.cast(pl.Float64),
            "Round": lambda col, decimals: col.round(decimals),
            "IsNull": lambda col: col.is_null(),
            "IsNotNull": lambda col: col.is_not_null(),
            "DateTimeNow": lambda: pl.lit(datetime.datetime.now()),
            "DateTimeToday": lambda: pl.lit(datetime.datetime.today().date()),
            "DateTimeUTC": lambda: pl.lit(datetime.datetime.now(datetime.timezone.utc)),
            "DateTimeYear": lambda col: col.dt.year(),
            "DateTimeMonth": lambda col: col.dt.month(),
            "DateTimeDay": lambda col: col.dt.day(),
            "DateTimeFormat": lambda col, fmt: col.dt.to_string(fmt),
            "DateTimeParse": lambda col, fmt: col.str.strptime(pl.Datetime, fmt)
        }

        for formula_config in formulas:
            output_col = formula_config.get("output_column")
            expr_raw = formula_config.get("expression")
            data_type = formula_config.get("data_type", "String")

            if not expr_raw or not output_col:
                continue

            polars_expr_str = parse_formula_to_polars(expr_raw)
            verify_safe_formula_expression(polars_expr_str)

            try:
                # Evaluate secure string into a Polars Expr using our comprehensive ETL context
                expr_obj = eval(polars_expr_str, ETL_CONTEXT)
                if not isinstance(expr_obj, pl.Expr):
                    expr_obj = pl.lit(expr_obj)

                # Enforce casting
                dt = TYPE_MAP.get(data_type, pl.Utf8)
                expr_obj = expr_obj.cast(dt)

                # Sequentially append/overwrite column
                res_df = res_df.with_columns(expr_obj.alias(output_col))
            except Exception as e:
                raise ValueError(f"Error evaluating formula for '{output_col}': {str(e)}")

        return res_df
