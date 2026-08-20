from typing import Dict, Any, List
import polars as pl
import time
import os
import pandas as pd
from app.tools.base import BaseNode

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

class PredictorTool(BaseNode):
    """
    A Sandbox tool that uses XGBoost (GPU accelerated) to predict missing values in target columns,
    and optionally uses Gemini to generate biased commentary.
    """
    MANIFEST = {
        "type": "PredictorTool",
        "name": "Predictor",
        "description": "Predicts target columns using XGBoost and optionally generates AI commentary.",
        "category": "Development",
        "icon": "BrainCircuit",
        "inputs": [{"id": "input", "label": "Dataset", "type": "dataframe"}],
        "outputs": [{"id": "output", "label": "Predictions", "type": "dataframe"}],
        "ui_schema": [
            {
                "field": "targets",
                "label": "Target Columns (Comma separated)",
                "type": "string",
                "default": ""
            },
            {
                "field": "features",
                "label": "Feature Columns (Comma separated)",
                "type": "string",
                "default": ""
            },
            {
                "field": "algorithm",
                "label": "Machine Learning Algorithm",
                "type": "enum",
                "options": ["XGBoost (GPU Accelerated)", "Random Forest", "Gradient Boosting", "Linear/Logistic Regression", "Naive Bayes"],
                "default": "XGBoost (GPU Accelerated)"
            },
            {
                "field": "null_handling",
                "label": "Feature Null Handling Strategy",
                "type": "enum",
                "options": [
                    "Drop Rows with NULLs", 
                    "Impute with Mean / Mode", 
                    "Random Fill (Min to Max)", 
                    "Fill with Zero / Empty"
                ],
                "default": "Impute with Mean / Mode"
            },
            {
                "field": "bias",
                "label": "Commentary Bias",
                "type": "enum",
                "options": ["None (No Commentary)", "Neutral Analyst", "Home Team Fanatic", "Away Team Fanatic"],
                "default": "None (No Commentary)"
            }
        ]
    }

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, pl.DataFrame]:
        df = self.get_input_dataframe(inputs)
        if df is None:
            raise ValueError("Input DataFrame is required for Predictor Tool.")
            
        if not XGB_AVAILABLE:
            raise RuntimeError("XGBoost is not installed on this machine.")

        targets = [t.strip() for t in self.parameters.get("targets", "").split(",") if t.strip()]
        features = [f.strip() for f in self.parameters.get("features", "").split(",") if f.strip()]
        algorithm = self.parameters.get("algorithm", "XGBoost (GPU Accelerated)")
        null_handling = self.parameters.get("null_handling", "Impute with Mean / Mode")
        bias = self.parameters.get("bias", "None (No Commentary)")
        
        if not targets:
            raise ValueError("No Target Columns specified.")
        if not features:
            raise ValueError("No Feature Columns specified.")

        self.log(f"Starting Prediction Engine. Targets: {targets}, Algorithm: {algorithm}")
        
        # Convert to Pandas for Scikit-Learn/XGBoost integration
        pdf = df.to_pandas()
        
        # Apply Feature Null Handling Strategy
        self.log(f"Applying null handling strategy: {null_handling}")
        if null_handling == "Drop Rows with NULLs":
            original_len = len(pdf)
            pdf = pdf.dropna(subset=features)
            self.log(f"Dropped {original_len - len(pdf)} rows containing NULLs in features.")
        elif null_handling == "Impute with Mean / Mode":
            import pandas as pd
            for col in features:
                if col not in pdf.columns: continue
                if pd.api.types.is_numeric_dtype(pdf[col]):
                    pdf[col] = pdf[col].fillna(pdf[col].mean())
                else:
                    mode_vals = pdf[col].mode()
                    if not mode_vals.empty:
                        pdf[col] = pdf[col].fillna(mode_vals.iloc[0])
        elif null_handling == "Random Fill (Min to Max)":
            import pandas as pd
            import numpy as np
            for col in features:
                if col not in pdf.columns: continue
                null_mask = pdf[col].isnull()
                n_nulls = null_mask.sum()
                if n_nulls == 0: continue
                
                if pd.api.types.is_numeric_dtype(pdf[col]):
                    min_val = pdf[col].min()
                    max_val = pdf[col].max()
                    # fill with uniform random float/int
                    if pd.api.types.is_integer_dtype(pdf[col]):
                        random_vals = np.random.randint(min_val, max_val + 1, size=n_nulls)
                    else:
                        random_vals = np.random.uniform(min_val, max_val, size=n_nulls)
                    pdf.loc[null_mask, col] = random_vals
                else:
                    # Randomly pick from existing valid categorical values
                    valid_vals = pdf[col].dropna().unique()
                    if len(valid_vals) > 0:
                        random_vals = np.random.choice(valid_vals, size=n_nulls)
                        pdf.loc[null_mask, col] = random_vals
        elif null_handling == "Fill with Zero / Empty":
            import pandas as pd
            for col in features:
                if col not in pdf.columns: continue
                if pd.api.types.is_numeric_dtype(pdf[col]):
                    pdf[col] = pdf[col].fillna(0)
                else:
                    pdf[col] = pdf[col].fillna("")
                    
        # Handle categoricals
        # Scikit-learn models (except HistGradientBoosting) require numeric features.
        # For simplicity, we will dynamically one-hot encode or target encode, or just drop non-numeric if using sklearn.
        # But wait, Random Forest in sklearn doesn't support categorical strings directly.
        # We must one-hot encode.
        if algorithm != "XGBoost (GPU Accelerated)":
            self.log("Applying One-Hot Encoding for Scikit-Learn compatibility...")
            pdf = pd.get_dummies(pdf, columns=[col for col in features if pdf[col].dtype == 'object' or pd.api.types.is_categorical_dtype(pdf[col])])
            # update features list to include the new one-hot encoded columns
            new_features = []
            for col in pdf.columns:
                if col in features:
                    new_features.append(col)
                elif any(col.startswith(f + "_") for f in features):
                    new_features.append(col)
            features = new_features
        else:
            for col in features:
                if col in pdf.columns and pdf[col].dtype == 'object':
                    pdf[col] = pdf[col].astype('category')
                
        # Train and Predict for each target
        from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier, GradientBoostingRegressor, GradientBoostingClassifier
        from sklearn.linear_model import LinearRegression, LogisticRegression
        from sklearn.naive_bayes import GaussianNB

        for target in targets:
            if target not in pdf.columns:
                self.log(f"Warning: Target column '{target}' not found in dataset. Skipping.")
                continue
                
            self.log(f"Training {algorithm} for target: {target}")
            
            train_mask = pdf[target].notnull()
            if not train_mask.any():
                self.log(f"Error: No non-null values found for target '{target}'. Cannot train model.")
                continue
                
            X_train = pdf.loc[train_mask, features]
            y_train = pdf.loc[train_mask, target]
            
            is_classification = pd.api.types.is_object_dtype(y_train) or pd.api.types.is_categorical_dtype(y_train) or pd.api.types.is_bool_dtype(y_train)
            
            if algorithm == "XGBoost (GPU Accelerated)":
                if is_classification:
                    y_train = y_train.astype('category')
                    model = xgb.XGBClassifier(enable_categorical=True, tree_method="hist", device="cuda", random_state=42)
                else:
                    model = xgb.XGBRegressor(enable_categorical=True, tree_method="hist", device="cuda", random_state=42)
            elif algorithm == "Random Forest":
                if is_classification: model = RandomForestClassifier(n_estimators=100, random_state=42)
                else: model = RandomForestRegressor(n_estimators=100, random_state=42)
            elif algorithm == "Gradient Boosting":
                if is_classification: model = GradientBoostingClassifier(random_state=42)
                else: model = GradientBoostingRegressor(random_state=42)
            elif algorithm == "Linear/Logistic Regression":
                if is_classification: model = LogisticRegression(max_iter=1000)
                else: model = LinearRegression()
            elif algorithm == "Naive Bayes":
                if is_classification: model = GaussianNB()
                else: 
                    self.log("Naive Bayes does not support regression. Falling back to Linear Regression.")
                    model = LinearRegression()
                
            start_time = time.time()
            # Handle NaN in training data for sklearn
            if algorithm != "XGBoost (GPU Accelerated)":
                X_train = X_train.fillna(0)
            
            model.fit(X_train, y_train)
            self.log(f"Model trained in {time.time() - start_time:.2f} seconds.")
            
            # Predict on ALL rows (historical for backtesting, and future)
            X_all = pdf[features]
            if algorithm != "XGBoost (GPU Accelerated)":
                X_all = X_all.fillna(0)
            predictions = model.predict(X_all)
            
            # Append predictions column
            pred_col_name = f"PRED_{target}"
            pdf[pred_col_name] = predictions
            self.log(f"Generated predictions for {target}. Column added as {pred_col_name}")

        # AI Commentary Phase
        if bias != "None (No Commentary)":
            self.log(f"Generating AI Commentary with bias: {bias}...")
            try:
                from google import genai
                import json
                
                api_key = os.environ.get("GOOGLE_API_KEY")
                if not api_key:
                    self.log("Warning: GOOGLE_API_KEY not set. Cannot generate AI commentary.")
                else:
                    client = genai.Client(api_key=api_key)
                    
                    # We will batch requests (e.g. 20 rows at a time) to avoid extreme delays
                    batch_size = 20
                    commentaries = []
                    
                    # For commentary, we only need the features and the predictions
                    pred_cols = [f"PRED_{t}" for t in targets if f"PRED_{t}" in pdf.columns]
                    relevant_cols = features + pred_cols
                    
                    # Construct system instruction based on bias
                    system_prompt = "You are a sports analyst reviewing machine learning predictions for upcoming matches. "
                    if bias == "Home Team Fanatic":
                        system_prompt += "You are heavily biased towards the Home Team. You look at the XGBoost prediction and features, and spin the commentary to sound incredibly optimistic for the home team, finding any excuse to believe they will perform well. "
                    elif bias == "Away Team Fanatic":
                        system_prompt += "You are heavily biased towards the Away Team. You always find a way to spin the stats and predictions in favor of the away team. "
                    elif bias == "Neutral Analyst":
                        system_prompt += "Provide an objective, statistically sound 1-2 sentence commentary based on the XGBoost prediction and the feature context. "
                        
                    system_prompt += "\nReturn a JSON array of strings, where each string is the 1-2 sentence commentary for that row. The length of the array MUST exactly match the number of rows provided in the input JSON."
                    
                    # Batch iterate
                    for i in range(0, len(pdf), batch_size):
                        batch_df = pdf.iloc[i:i+batch_size][relevant_cols]
                        batch_json = batch_df.to_json(orient='records')
                        
                        prompt = f"{system_prompt}\n\nHere is the data batch (JSON):\n{batch_json}"
                        
                        response = client.models.generate_content(
                            model='gemini-2.5-flash', # Use flash for faster bulk generation
                            contents=prompt,
                        )
                        
                        # Parse JSON response
                        try:
                            text = response.text.strip()
                            if text.startswith("```json"): text = text[7:]
                            if text.startswith("```"): text = text[3:]
                            if text.endswith("```"): text = text[:-3]
                            
                            batch_comments = json.loads(text.strip())
                            if isinstance(batch_comments, list):
                                commentaries.extend(batch_comments)
                            else:
                                commentaries.extend(["JSON error"] * len(batch_df))
                        except Exception as e:
                            self.log(f"Failed to parse commentary JSON for batch: {str(e)}")
                            commentaries.extend(["Commentary parsing failed"] * len(batch_df))
                            
                    # Pad or truncate if length mismatch
                    if len(commentaries) < len(pdf):
                        commentaries.extend(["No comment"] * (len(pdf) - len(commentaries)))
                    elif len(commentaries) > len(pdf):
                        commentaries = commentaries[:len(pdf)]
                        
                    pdf["AI_Commentary"] = commentaries
                    self.log("AI Commentary successfully generated and merged.")
            
            except Exception as e:
                self.log(f"Error during AI Commentary generation: {str(e)}")

        # Convert back to polars
        result_df = pl.from_pandas(pdf)
        self.log("Predictor Tool Execution Complete.")
        
        return {"output": result_df}
