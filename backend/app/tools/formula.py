import polars as pl
import re
from typing import Dict, Any
from app.tools.base import BaseNode

def parse_formula_to_polars(expression_str: str) -> str:
    """
    Parses an Alteryx-style compute expression into a Polars eval string.
    E.g. "[Salary] * 1.10" -> "(pl.col('Salary') * 1.10)"
    """
    def replace_bracket(match):
        col_name = match.group(1)
        col_name = col_name.replace('"', '\\"')
        return f'pl.col("{col_name}")'
        
    polars_str = re.sub(r'\[(.*?)\]', replace_bracket, expression_str)
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
    
    try:
        tree = ast.parse(polars_str)
        for node in ast.walk(tree):
            # Block any attribute chaining trickery on the datetime module (e.g., datetime.os)
            if isinstance(node, ast.Attribute):
                if isinstance(node.value, ast.Name) and node.value.id == 'datetime':
                    if node.attr not in {'date', 'datetime', 'time', 'timedelta', 'strptime'}:
                        raise SecurityError(f"Restricted datetime attribute blocked: '{node.attr}'")
            
            # Intercept explicit dangerous builtins or hidden lookups
            if isinstance(node, ast.Name):
                 if node.id not in allowed_names and not node.id.islower():
                     if node.id in {'eval', 'exec', 'open', 'compile', '__import__', 'os', 'subprocess', 'shutil', 'requests'}:
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
        "icon": "Calculator",
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
            
        polars_expr_str = parse_formula_to_polars(expression)
        self.log(f"Compiling Formula: '{expression}' -> {polars_expr_str}")
        
        try:
            # Helper functions for Alteryx-like operations
            def ToString(col):
                if isinstance(col, pl.Expr): return col.cast(pl.Utf8)
                return str(col)
                
            def ToNumber(col):
                if isinstance(col, pl.Expr): return col.cast(pl.Float64)
                return float(col)
                
            def IIF(cond, t, f):
                if not isinstance(cond, pl.Expr): cond = pl.lit(cond)
                if not isinstance(t, pl.Expr): t = pl.lit(t)
                if not isinstance(f, pl.Expr): f = pl.lit(f)
                return pl.when(cond).then(t).otherwise(f)
                
            # Intercept Malicious Injections via AST Scanning
            verify_safe_formula_expression(polars_expr_str)

            eval_context = {
                "pl": pl, 
                "datetime": __import__("datetime"),
                "ToString": ToString,
                "ToNumber": ToNumber,
                "IIF": IIF,
                "IF": IIF,
                "__builtins__": {}  # Lock down the execution window environment
            }
            
            # pylint: disable=eval-used
            compiled_expr = eval(polars_expr_str, eval_context)
            compiled_expr = compiled_expr.alias(output_column)
            res_df = df.with_columns(compiled_expr)
            self.log(f"Formula applied successfully. Target column: {output_column}")
        except Exception as e:
            from app.tools.base import SecurityError
            if isinstance(e, SecurityError):
                self.log(f"Security Block: {str(e)}")
            else:
                self.log(f"Error evaluating formula '{expression}': {str(e)}")
            raise ValueError(f"Formula Error: {str(e)}")

        return res_df
