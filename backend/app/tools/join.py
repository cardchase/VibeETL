import polars as pl
from typing import Dict, Any, List
from app.tools.base import BaseNode

class JoinNode(BaseNode):
    MANIFEST = {
        "id": "join",
        "name": "Join",
        "category": "join",
        "icon": "GitMerge",
        "description": "Join two datasets together based on a common key.",
        "ui_schema": [
            {"field": "left_keys", "type": "string", "label": "Left Key Column", "default": ""},
            {"field": "right_keys", "type": "string", "label": "Right Key Column", "default": ""},
            {"field": "how", "type": "select", "label": "Join Type", "options": ["left", "inner", "outer", "semi", "anti"], "default": "left"}
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        # Check inputs. Usually we expect 'left' and 'right' but some engines send 'input1'/'input2'.
        # For our system, the front-end will send connections. If there are multiple, they are keyed.
        # However, to be robust, let's grab the first two inputs.
        keys = list(inputs.keys())
        if len(keys) < 2:
            raise ValueError(f"Join node requires exactly two inputs (left and right). Received: {keys}")

        # Determine left and right based on common port naming, or just order
        left_df = inputs.get("left", inputs.get(keys[0]))
        right_df = inputs.get("right", inputs.get(keys[1]))

        if left_df is None or right_df is None:
            raise ValueError("Join node missing left or right input dataframe.")

        left_keys = self.parameters.get("left_keys", [])
        right_keys = self.parameters.get("right_keys", [])
        how = self.parameters.get("how", "inner")

        # Fallback for backward compatibility
        if not left_keys and self.parameters.get("left_key"):
            left_keys = [self.parameters.get("left_key")]
        if not right_keys and self.parameters.get("right_key"):
            right_keys = [self.parameters.get("right_key")]

        # Filter empty strings
        left_keys = [k for k in left_keys if k]
        right_keys = [k for k in right_keys if k]

        if not left_keys or not right_keys:
            self.log("Left or right keys not specified. Returning left dataframe.")
            return left_df

        if len(left_keys) != len(right_keys):
            raise ValueError(f"Join error: Mismatched number of left keys ({len(left_keys)}) and right keys ({len(right_keys)})")

        from app.tools.base import SchemaCompatibilityError
        for l_key in left_keys:
            if l_key not in left_df.columns:
                raise SchemaCompatibilityError(f"Join error: left key '{l_key}' not found in left input schema. Available: {left_df.columns}")

        for r_key in right_keys:
            if r_key not in right_df.columns:
                raise SchemaCompatibilityError(f"Join error: right key '{r_key}' not found in right input schema. Available: {right_df.columns}")

        self.log(f"Performing {how} join. Left keys: {left_keys}, Right keys: {right_keys}.")

        try:
            # Polars join
            res_df = left_df.join(right_df, left_on=left_keys, right_on=right_keys, how=how)
            self.log(f"Join successful. Result has {res_df.height} rows and {res_df.width} columns.")
            return res_df
        except Exception as e:
            self.log(f"Join failed: {str(e)}")
            raise ValueError(f"Join operation failed: {str(e)}")
