import polars as pl
import re
from typing import Dict, Any
from app.tools.base import BaseNode

def parse_formula_to_polars(expression_str: str) -> str:
    """
    Parses an Alteryx-style compute expression into a Polars eval string.
    E.g. "[Salary] * 1.10" -> "(pl.col('Salary') * 1.10)"
    """
    # Auto-fix common syntax typos before bracket replacement
    polars_str = re.sub(r'(?i)\btostr\s*\[', 'ToString([', expression_str)
    polars_str = re.sub(r'(?i)\btonumber\s*\[', 'ToNumber([', polars_str)

    def replace_bracket(match):
        col_name = match.group(1)
        col_name = col_name.replace('"', '\\"')
        return f'pl.col("{col_name}")'
        
    polars_str = re.sub(r'\[(.*?)\]', replace_bracket, polars_str)
    polars_str = re.sub(r'\bAND\b', '&', polars_str, flags=re.IGNORECASE)
    polars_str = re.sub(r'\bOR\b', '|', polars_str, flags=re.IGNORECASE)
    
    return f"({polars_str})"

def verify_safe_formula_expression(polars_str: str) -> None:
    """
    Scans the compiled Polars formula expression to block malicious system calls,
    unauthorized module extraction, or file system escapes inside text blocks.
    """
    import ast
    from app.tools.base import SecurityError
    
    # Explicit list of permitted top-level names inside the formula canvas execution frame
    allowed_names = {'pl', 'ToString', 'ToNumber', 'IIF', 'IF', 'datetime'}
    forbidden_calls = {'eval', 'exec', 'open', 'compile', '__import__', 'os', 'subprocess', 'shutil', 'requests', 'sys', 'builtins', 'globals', 'locals', 'getattr', 'setattr', 'delattr', 'hasattr'}
    
    try:
        tree = ast.parse(polars_str)
        for node in ast.walk(tree):
            # Block any attribute chaining trickery on the datetime module (e.g., datetime.os)
            if isinstance(node, ast.Attribute):
                if node.attr.startswith('__'):
                    raise SecurityError(f"Restricted attribute access intercepted: '{node.attr}'")
                if isinstance(node.value, ast.Name) and node.value.id == 'datetime':
                    if node.attr not in {'date', 'datetime', 'time', 'timedelta', 'strptime'}:
                        raise SecurityError(f"Restricted datetime attribute blocked: '{node.attr}'")
            
            # Intercept explicit dangerous builtins or hidden lookups
            if isinstance(node, ast.Name):
                 if node.id in forbidden_calls or node.id.startswith('__'):
                     raise SecurityError(f"Restricted execution call intercepted: '{node.id}'")
    except SecurityError as se:
        raise se
    except Exception:
        raise ValueError("Malformed custom expression syntax geometry inside the formula token processor.")

class FormulaNode(BaseNode):
    MANIFEST = {
        "id": "formula",
        "name": "Formula",
        "category": "prep",
        "icon": "Code",
        "description": "Compute a new column or update an existing one using an expression.",
        "ui_schema": [
            {"field": "output_column", "type": "column_creatable", "label": "Output Column Name", "default": "NewColumn"},
            {"field": "expression", "type": "textarea", "label": "Formula Expression", "default": ""}
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Awaiting connection: Formula node requires an incoming data stream.")

        output_column = self.parameters.get("output_column", "NewColumn")
        expression = self.parameters.get("expression", "")

        if not expression or not output_column:
            self.log("Output column or expression is empty. Skipping formula.")
            return df
            
        try:
            # Convert [Column] to "Column" to support Alteryx-style brackets
            sql_expr = re.sub(r'\[(.*?)\]', r'"\1"', expression)
            
            # Basic backward compatibility for common functions
            sql_expr = re.sub(r'(?i)\bToString\((.*?)\)', r'CAST(\1 AS VARCHAR)', sql_expr)
            sql_expr = re.sub(r'(?i)\bToNumber\((.*?)\)', r'CAST(\1 AS DOUBLE)', sql_expr)
            sql_expr = re.sub(r'(?i)\bIIF\(', 'IF(', sql_expr)
            
            formatted_sql = re.sub(r'(?i)\s+(AND|OR)\s+', r'\n\1 ', sql_expr)
            self.log(f"Compiled SQL Formula:\n'{expression}'\n->\n{formatted_sql}")
            
            ctx = pl.SQLContext(df=df)
            
            # Using a temporary output column to evaluate the expression
            temp_col = f"{output_column}_temp"
            res_df = ctx.execute(f"SELECT *, ({sql_expr}) AS `{temp_col}` FROM df").collect()
            
            # Safely replace existing column or add it at the end
            original_cols = df.columns
            if output_column in original_cols:
                res_df = res_df.drop(output_column).rename({temp_col: output_column})
                # Preserve original column order
                res_df = res_df.select(original_cols)
            else:
                res_df = res_df.rename({temp_col: output_column})
                
            self.log(f"Formula applied successfully. Target column: {output_column}")
        except Exception as e:
            self.log(f"Error evaluating formula '{expression}': {str(e)}")
            raise ValueError(f"Formula Error: {str(e)}")

        return res_df
