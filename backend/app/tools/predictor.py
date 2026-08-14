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
                "field": "personality",
                "type": "select",
                "label": "🎭 Prediction Personality",
                "options": [
                    "Conservative (Default, Most Accurate)", 
                    "Exciting (High Scoring & Upsets)", 
                    "Underdog Seeker (Boosts Weaker Teams)", 
                    "Defensive Stalemate (Low Scoring)",
                    "Form-Heavy (Recency Bias)",
                    "All Personalities (Outputs Multiple Columns)"
                ],
                "default": "Conservative (Default, Most Accurate)"
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
        personality = self.parameters.get("personality", "Conservative (Default, Most Accurate)")

        if not target_cols:
            self.log("No target columns selected for Predictor.")
            return df
            
        # Standardize empty strings to nulls for target columns to prevent data leakage/crashes
        import polars as pl
        for target in target_cols:
            if target in df.columns:
                # Replace empty strings with None so they are properly detected as nulls
                df = df.with_columns(pl.when(pl.col(target) == "").then(None).otherwise(pl.col(target)).alias(target))

        # We will hold the output DataFrame which will just be `df` with new columns
        full_pd = df.to_pandas()
        
        # Enterprise Anti-Leakage: Post-match outcomes that MUST be hidden to prevent cheating
        post_match_outcomes = {
            'FT_HomeScore', 'FT_AwayScore', 
            'HT_HomeScore', 'HT_AwayScore', 
            'SH_HomeScore', 'SH_AwayScore',
            'Match_Status', 'Winner', 'Result'
        }
        
        def apply_personality(predictions, is_classification, is_poisson, personality_type, target_name, df_full=None):
            if is_classification or not is_poisson:
                return predictions
                
            if "Conservative" in personality_type:
                return predictions
            
            import numpy as np
            preds_array = np.array(predictions, dtype=float)
            
            # Preserve relative distribution dynamics instead of flat multiplication
            if "Exciting" in personality_type:
                # Push the lambda harder to shift the Poisson mode from 1 goal to 3 goals
                preds_array = np.where(preds_array > 1.0, preds_array * 1.5 + 0.4, preds_array * 1.25)
                self.log(f"💥 Applied 'Exciting' personality to {target_name} (Aggressive attacking boost)")
                
            elif "Defensive" in personality_type:
                # Squash expected goals heavily by a percentage to force 0-0 or 1-0 modes
                preds_array = np.maximum(0.1, preds_array * 0.6)
                self.log(f"🛡️ Applied 'Defensive' personality to {target_name} (Heavy defensive suppression)")
                
            elif "Underdog" in personality_type:
                # Invert the traditional strengths drastically to force upset modes
                if "Away" in target_name:
                    preds_array = preds_array * 1.4 + 0.5
                    self.log(f"🐕 Applied 'Underdog' personality to {target_name} (Massive Away boost)")
                else:
                    preds_array = preds_array * 0.8
                    self.log(f"🐕 Applied 'Underdog' personality to {target_name} (Home penalty)")
            elif "Form-Heavy" in personality_type and not is_classification and df_full is not None:
                team_type = "HomeTeam" if "Home" in target_name else "AwayTeam"
                form_col = None
                for c in df_full.columns:
                    if team_type in c and "Form_Last5_Pts" in c:
                        form_col = c
                        break
                if form_col:
                    form_vals = df_full[form_col].fillna(7.0).values
                    # Base is ~7 pts. 0 pts = 0.7x multiplier, 15 pts = 1.3x multiplier
                    scale_factor = 0.7 + (form_vals / 15.0) * 0.6
                    preds_array = preds_array * scale_factor
                    self.log(f"🔥 Applied 'Form-Heavy' personality to {target_name} (Form multiplier applied)")
                    
            return preds_array
            
        def store_predictions(raw_preds, is_class, is_poiss, p_type, tgt, df_full, msg_suffix=""):
            if "All Personalities" in p_type:
                # Always provide the raw base prediction as the root column
                df_full[f"Predicted_{tgt}"] = apply_personality(raw_preds, is_class, is_poiss, "Conservative", tgt, df_full)
                
                for p_name in ["Conservative", "Exciting", "Underdog", "Defensive", "Form-Heavy"]:
                    adj_preds = apply_personality(raw_preds, is_class, is_poiss, p_name, tgt, df_full)
                    df_full[f"Predicted_{tgt}_{p_name}"] = adj_preds
            else:
                adj_preds = apply_personality(raw_preds, is_class, is_poiss, p_type, tgt, df_full)
                df_full[f"Predicted_{tgt}"] = adj_preds
            self.log(f"Generated predictions for {len(df_infer)} empty rows{msg_suffix}.")
        
        for target in target_cols:
            if target not in df.columns:
                continue
                
            # Build mask for rows with known targets (Training Data)
            mask = df[target].is_not_null()
            df_train = df.filter(mask)
            df_infer = df.filter(~mask)
            
            if df_train.is_empty():
                self.log(f"No training data available for {target} (all rows are null). Skipping.")
                continue

            # Intelligent Data Leakage Prevention
            # Ensure targets and explicit post-match outcomes are removed from features
            features_to_drop = set(target_cols).union(post_match_outcomes)
            feature_cols = [c for c in df.columns if c not in features_to_drop]

            self.log(f"--- PREDICTING: {target} ---")
            dropped = list(features_to_drop.intersection(set(df.columns)))
            self.log(f"Preventing data leakage: Dropped {len(dropped)} future outcome variables.")

            # 1. Convert categories on the FULL dataframe first to prevent XGBoost category mismatch
            for col in feature_cols:
                if full_pd[col].dtype == 'object' or str(full_pd[col].dtype) == 'string':
                    full_pd[col] = full_pd[col].astype('category')

            # 2. Slice train_pd AFTER categorical conversion so dtypes match perfectly
            train_pd = full_pd[full_pd[target].notnull()].copy()
            
            # Identify task type
            is_classification = False
            is_poisson = False
            
            target_dtype = str(train_pd[target].dtype)
            
            if task_type == "Auto-Detect":
                if "Score" in target or "Goal" in target:
                    is_poisson = True
                    self.log("Auto-detected Poisson task (Count Data).")
                    # Force cast to float in case Select tool made it a string
                    import pandas as pd
                    train_pd[target] = pd.to_numeric(train_pd[target], errors='coerce')
                    full_pd[target] = pd.to_numeric(full_pd[target], errors='coerce')
                    target_dtype = str(train_pd[target].dtype)
                elif target_dtype in ['object', 'string', 'category', 'bool']:
                    is_classification = True
                    self.log("Auto-detected Classification task.")
                else:
                    self.log("Auto-detected Regression task.")
            elif task_type == "Regression (Decimals/Odds)":
                self.log("Auto-detected Regression task.")
            elif task_type == "Classification (Categories/Wins)":
                is_classification = True
            else:
                is_poisson = True
                self.log("Auto-detected Poisson task.")

            # Categorical features are already encoded on full_pd above
            X_train_full = train_pd[feature_cols]
            y_train_full = train_pd[target]
            X_full = full_pd[feature_cols]
            
            # If classification, we need to map string labels to integers for XGBoost
            label_map = None
            if is_classification and (target_dtype == 'object' or target_dtype == 'string' or target_dtype == 'category'):
                labels = y_train_full.unique().tolist()
                label_map = {k: v for v, k in enumerate(labels)}
                y_train_full = y_train_full.map(label_map)
            # Dynamic Depth based on dataset size
            # Small dataset (<5k) -> depth 4 to prevent overfitting
            # Medium dataset -> depth 6
            # Large dataset (>20k) -> depth 8
            if len(train_pd) < 5000:
                dynamic_depth = 4
            elif len(train_pd) < 20000:
                dynamic_depth = 6
            else:
                dynamic_depth = 8

            # Define model params (using 1000 estimators for early stopping)
            params = {
                "tree_method": "hist",
                "device": "cuda",             # GPU Acceleration
                "enable_categorical": True,
                "learning_rate": 0.05,
                "max_depth": dynamic_depth,
                "n_estimators": 1000,
                "random_state": 42
            }
            
            if is_poisson:
                params["objective"] = "count:poisson"

            best_iteration = 100 # default fallback
            
            try:
                # TRAIN / TEST EVALUATION CYCLE
                if len(train_pd) > 10:
                    # Chronological Train/Test Split (Preserves Time Order)
                    split_idx = int(len(X_train_full) * 0.8)
                    X_tr, X_te = X_train_full.iloc[:split_idx], X_train_full.iloc[split_idx:]
                    y_tr, y_te = y_train_full.iloc[:split_idx], y_train_full.iloc[split_idx:]
                    
                    if is_classification:
                        eval_model = xgb.XGBClassifier(early_stopping_rounds=30, **params)
                        eval_model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
                        best_iteration = eval_model.best_iteration
                        eval_preds = eval_model.predict(X_te)
                        acc = accuracy_score(y_te, eval_preds) * 100
                        self.log(f"Evaluated Chronological Blind Accuracy: {acc:.2f}%")
                    else:
                        eval_model = xgb.XGBRegressor(early_stopping_rounds=30, **params)
                        eval_model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
                        best_iteration = eval_model.best_iteration
                        eval_preds = eval_model.predict(X_te)
                        mae = mean_absolute_error(y_te, eval_preds)
                        self.log(f"Evaluated Chronological Blind Accuracy (MAE): {mae:.3f}")
                else:
                    self.log("Skipped Out-of-Sample Evaluation: Not enough historical data (< 10 rows). Proceeding directly to full training & prediction.")

                # FINAL RETRAINING ON 100% OF DATA
                # Scale best_iteration up by 25% because we are training on 100% instead of 80%
                final_estimators = max(10, int(best_iteration * 1.25))
                params["n_estimators"] = final_estimators
                
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
                
                store_predictions(preds, is_classification, is_poisson, personality, target, full_pd)
                
                # Log feature importances
                importance = model.feature_importances_
                feat_imp = sorted(zip(feature_cols, importance), key=lambda x: x[1], reverse=True)
                self.log("Top Decision Patterns:")
                for f, imp in feat_imp[:5]:
                    self.log(f"  ⭐ {f} ({imp * 100:.1f}% impact)")
                    
            except Exception as e:
                self.log(f"XGBoost GPU failed for {target}: {e}. Retrying on CPU...")
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
                        
                    store_predictions(preds, is_classification, is_poisson, personality, target, full_pd, " using CPU")
                except Exception as inner_e:
                    self.log(f"CPU fallback also failed: {inner_e}")
                    raise

        # Convert back to Polars
        full_pl = pl.from_pandas(full_pd)
        
        # Determine upcoming matches (rows missing target labels) to output ONLY those
        if target_cols and target_cols[0] in df.columns:
            mask = df[target_cols[0]].is_null()
            upcoming_pl = full_pl.filter(mask)
            
            # If we successfully found upcoming matches, return just them. 
            # Otherwise return full dataset (e.g. if everything was predicted already)
            if len(upcoming_pl) > 0:
                self.log(f"Filtered output from {len(full_pl)} total rows down to {len(upcoming_pl)} Upcoming matches.")
                return upcoming_pl
                
        return full_pl
