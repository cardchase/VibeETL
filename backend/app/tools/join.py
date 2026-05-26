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
            {"field": "left_key", "type": "string", "label": "Left Key Column", "default": ""},
            {"field": "right_key", "type": "string", "label": "Right Key Column", "default": ""},
            {"field": "how", "type": "select", "label": "Join Type", "options": ["inner", "left", "outer", "semi", "anti"], "default": "inner"}
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

        left_key = self.parameters.get("left_key", "")
        right_key = self.parameters.get("right_key", "")
        how = self.parameters.get("how", "inner")

        if not left_key or not right_key:
            self.log("Left or right key not specified. Returning left dataframe.")
            return left_df

        if left_key not in left_df.columns:
            from app.tools.base import SchemaCompatibilityError
            raise SchemaCompatibilityError(f"Join error: left key '{left_key}' not found in left input schema. Available: {left_df.columns}")

        if right_key not in right_df.columns:
            from app.tools.base import SchemaCompatibilityError
            raise SchemaCompatibilityError(f"Join error: right key '{right_key}' not found in right input schema. Available: {right_df.columns}")

        self.log(f"Performing {how} join. Left key: '{left_key}', Right key: '{right_key}'.")

        try:
            # Polars join
            res_df = left_df.join(right_df, left_on=left_key, right_on=right_key, how=how)
            self.log(f"Join successful. Result has {res_df.height} rows and {res_df.width} columns.")
            return res_df
        except Exception as e:
            self.log(f"Join failed: {str(e)}")
            raise ValueError(f"Join operation failed: {str(e)}")
