import polars as pl
import pandas as pd
import xgboost as xgb
import logging
from typing import Dict
from app.tools.base import BaseNode
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error

logger = logging.getLogger(__name__)

class PredictorNode(BaseNode):
    MANIFEST = {
        "id": "predictor",
        "name": "Soccer Predictor",
        "category": "prep",
        "icon": "Brain",
        "description": "Intelligent XGBoost predictor (GPU) with automatic data leakage prevention and evaluation.",
        "ui_schema": [
            {
                "field": "help1",
                "type": "help_text",
                "label": "",
                "content": "<strong>💡 One-Click Prediction:</strong> Select the columns you want to predict. The Engine will automatically use <strong>all other columns</strong> as features to learn from. If you want to drop a column (like URL or Date) so the Engine can't see it, simply use a <strong>Select</strong> tool before this node!"
            },
            {
                "field": "targetColumns",
                "type": "column_multi_select",
                "label": "🎯 Target Columns (What to Predict)",
                "default": ["FT_HomeScore", "FT_AwayScore"]
            },
            {
                "field": "taskType",
                "type": "select",
                "label": "🧠 Machine Learning Task Type",
                "options": ["Auto-Detect", "Poisson (Goal Counts)", "Regression (Decimals/Odds)", "Classification (Categories/Wins)"],
                "default": "Auto-Detect"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df_hist = inputs.get("historical")
        df_up = inputs.get("upcoming")
        df_legacy = inputs.get("input")

        if df_hist is not None and df_up is not None:
            try:
                df = pl.concat([df_hist, df_up], how="diagonal")
            except Exception as e:
                raise ValueError(f"Could not merge Historical and Upcoming datasets: {e}")
        elif df_hist is not None:
            df = df_hist
        elif df_up is not None:
            df = df_up
        elif df_legacy is not None:
            df = df_legacy
        else:
            raise ValueError("Predictor node requires an incoming data stream (Historical, Upcoming, or generic Input).")

        target_cols = self.parameters.get("targetColumns", ["FT_HomeScore", "FT_AwayScore"])
        task_type = self.parameters.get("taskType", "Auto-Detect")

        if not target_cols:
            logger.warning("No target columns selected for Predictor.")
            return df

        # We will hold the output DataFrame which will just be `df` with new columns
        full_pd = df.to_pandas()
        
        # Hardcoded leakage heuristics for soccer matches
        leakage_keywords = ['Score', 'BTTS', 'OU', 'DC', 'DNB', 'Winner', 'Result']
        
        for target in target_cols:
            if target not in df.columns:
                continue
                
            # Build mask for rows with known targets (Training Data)
            mask = df[target].is_not_null()
            df_train = df.filter(mask)
            df_infer = df.filter(~mask)
            
            if df_train.is_empty():
                logger.warning(f"No training data available for {target} (all rows are null). Skipping.")
                continue

            # Intelligent Data Leakage Prevention
            # If predicting a score, we must drop all OTHER scores and match outcomes from features!
            auto_dropped = set()
            if any(kw in target for kw in leakage_keywords):
                for col in df.columns:
                    if col == target: continue
                    if any(kw in col for kw in leakage_keywords):
                        auto_dropped.add(col)

            # All other columns are features
            features_to_drop = set(target_cols).union(auto_dropped)
            feature_cols = [c for c in df.columns if c not in features_to_drop]

            logger.info(f"--- PREDICTING: {target} ---")
            if auto_dropped:
                logger.info(f"⚠️ ANTI-LEAKAGE: Automatically hid {len(auto_dropped)} future outcome columns from the Engine to prevent cheating: {list(auto_dropped)[:5]}...")
            
            logger.info(f"Using {len(feature_cols)} features for learning.")

            train_pd = df_train.to_pandas()
            
            # Identify task type
            is_classification = False
            is_poisson = False
            
            target_dtype = str(train_pd[target].dtype)
            
            if task_type == "Auto-Detect":
                if target_dtype in ['object', 'string', 'category', 'bool']:
                    is_classification = True
                    logger.info("Auto-detected Classification task.")
                elif "Score" in target or "Goal" in target:
                    is_poisson = True
                    logger.info("Auto-detected Poisson task (Count Data).")
                else:
                    logger.info("Auto-detected Regression task (Continuous Data).")
            else:
                if task_type == "Classification (Categories/Wins)":
                    is_classification = True
                elif task_type == "Poisson (Goal Counts)":
                    is_poisson = True

            # Encode categorical features
            for col in feature_cols:
                if train_pd[col].dtype == 'object' or str(train_pd[col].dtype) == 'string':
                    train_pd[col] = train_pd[col].astype('category')
                    full_pd[col] = full_pd[col].astype('category')

            X_train_full = train_pd[feature_cols]
            y_train_full = train_pd[target]
            X_full = full_pd[feature_cols]
            
            # If classification, we need to map string labels to integers for XGBoost
            label_map = None
            if is_classification and (target_dtype == 'object' or target_dtype == 'string' or target_dtype == 'category'):
                labels = y_train_full.unique().tolist()
                label_map = {k: v for v, k in enumerate(labels)}
                y_train_full = y_train_full.map(label_map)
                logger.info(f"Mapped categories to integers: {label_map}")

            # Define model params
            params = {
                "tree_method": "hist",
                "device": "cuda",             # GPU Acceleration
                "enable_categorical": True,
                "learning_rate": 0.05,
                "max_depth": 6,
                "n_estimators": 100,
                "random_state": 42
            }
            
            if is_poisson:
                params["objective"] = "count:poisson"

            try:
                # TRAIN / TEST EVALUATION CYCLE
                if len(train_pd) > 10:
                    self.log("--------------------------------------------------")
                    self.log("🔄 IN-SAMPLE VS OUT-OF-SAMPLE EVALUATION CYCLE")
                    self.log("Splitting historical data: 80% for the Engine to learn, 20% held back to test it blind.")
                    X_tr, X_te, y_tr, y_te = train_test_split(X_train_full, y_train_full, test_size=0.2, random_state=42)
                    
                    if is_classification:
                        eval_model = xgb.XGBClassifier(**params)
                        eval_model.fit(X_tr, y_tr)
                        eval_preds = eval_model.predict(X_te)
                        acc = accuracy_score(y_te, eval_preds) * 100
                        self.log(f"✅ TRUE BLIND ACCURACY: {acc:.2f}% (How often it guessed right on matches it had never seen before)")
                    else:
                        eval_model = xgb.XGBRegressor(**params)
                        eval_model.fit(X_tr, y_tr)
                        eval_preds = eval_model.predict(X_te)
                        mae = mean_absolute_error(y_te, eval_preds)
                        self.log(f"✅ TRUE BLIND ACCURACY (MAE): The Engine's predictions were off by an average of {mae:.3f} on matches it had never seen before.")
                    self.log("--------------------------------------------------")
                else:
                    self.log("Not enough data for Train/Test split evaluation (< 10 rows).")

                # FINAL RETRAINING ON 100% OF DATA
                self.log(f"🚀 Retraining final model on all {len(X_train_full)} rows to maximize knowledge before predicting.")
                
                if is_classification:
                    model = xgb.XGBClassifier(**params)
                else:
                    model = xgb.XGBRegressor(**params)
                    
                model.fit(X_train_full, y_train_full)
                
                # Predict on the full dataset (null rows + existing rows)
                preds = model.predict(X_full)
                
                # Reverse map labels if classification
                if is_classification and label_map:
                    reverse_map = {v: k for k, v in label_map.items()}
                    preds = [reverse_map.get(p, p) for p in preds]
                
                pred_col = f"Predicted_{target}"
                full_pd[pred_col] = preds
                logger.info(f"Generated predictions for {len(df_infer)} empty rows.")
                
                # Log feature importances
                importance = model.feature_importances_
                feat_imp = sorted(zip(feature_cols, importance), key=lambda x: x[1], reverse=True)
                logger.info(f"Top 5 most important patterns for predicting {target}:")
                for f, imp in feat_imp[:5]:
                    logger.info(f"  ⭐ {f}: {imp:.4f}")
                    
                useless = [f for f, imp in feat_imp if imp <= 0.0]
                if useless:
                    logger.info(f"Found {len(useless)} useless columns with 0.0 impact on {target}.")
                    
            except Exception as e:
                logger.error(f"XGBoost GPU failed for {target}: {e}. Retrying on CPU...")
                # Fallback to CPU
                try:
                    params["device"] = "cpu"
                    if is_classification:
                        model = xgb.XGBClassifier(**params)
                    else:
                        model = xgb.XGBRegressor(**params)
                        
                    model.fit(X_train_full, y_train_full)
                    preds = model.predict(X_full)
                    if is_classification and label_map:
                        reverse_map = {v: k for k, v in label_map.items()}
                        preds = [reverse_map.get(p, p) for p in preds]
                        
                    full_pd[f"Predicted_{target}"] = preds
                    logger.info(f"Generated predictions for {len(df_infer)} empty rows using CPU.")
                except Exception as inner_e:
                    logger.error(f"CPU fallback also failed: {inner_e}")
                    raise

        # Convert back to Polars
        return pl.from_pandas(full_pd)
