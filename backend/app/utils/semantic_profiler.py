import polars as pl
import re
from typing import Dict, Tuple

def profile_and_cast_df(df: pl.DataFrame) -> Tuple[pl.DataFrame, Dict[str, str]]:
    """
    Scans a Polars DataFrame for semantic types (Currency, Percentages, Accounting formats).
    Casts them to physical numeric types and returns the updated DataFrame and a metadata dict.
    """
    metadata = {}
    expressions = []

    # We use basic regex matching to identify currency formats.
    # Matches: $100, $ 100, 1,000.50, ($1,000.50), (100)
    currency_usd_pattern = r'^\s*\(?\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*\)?\s*$'
    percentage_pattern = r'^\s*-?\d+(?:\.\d+)?\s*%\s*$'
    
    for col in df.columns:
        dtype = df.schema[col]
        expr = pl.col(col)
        
        # Only profile String columns
        if dtype in [pl.Utf8, pl.String]:
            # Sample non-null data (up to 100 rows)
            sample = df.select(col).drop_nulls().head(100).to_series().to_list()
            if not sample:
                continue
                
            # Check for currency (USD)
            is_currency = all(re.match(currency_usd_pattern, str(val)) for val in sample if str(val).strip())
            
            # Check for percentage
            is_percentage = not is_currency and all(re.match(percentage_pattern, str(val)) for val in sample if str(val).strip())
            
            if is_currency:
                metadata[col] = "currency_usd"
                # 1. Strip out '$', ',', and spaces.
                expr = expr.str.replace_all(r'[\$,\s]', '')
                # 2. Handle accounting parenthesis: (100.50) -> -100.50
                expr = expr.str.replace(r'^\((.*)\)$', r'-${1}')
                # 3. Cast to Float64
                expr = expr.cast(pl.Float64, strict=False)
                expressions.append(expr.alias(col))
                
            elif is_percentage:
                metadata[col] = "percentage"
                # Strip '%' and cast
                expr = expr.str.replace_all(r'[%]', '').cast(pl.Float64, strict=False) / 100.0
                expressions.append(expr.alias(col))
        
    if expressions:
        res_df = df.with_columns(expressions)
    else:
        res_df = df

    return res_df, metadata
