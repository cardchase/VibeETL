import polars as pl
import pandas as pd
import xgboost as xgb
import numpy as np
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
            self.log("No target columns selected for Predictor.")
            return df
            
        # Standardize empty strings to nulls for target columns to prevent data leakage/crashes
        import polars as pl
        for target in target_cols:
            if target in df.columns:
                # Replace empty strings with None so they are properly detected as nulls
                if df[target].dtype in (pl.Utf8, getattr(pl, 'String', None)):
                    df = df.with_columns(pl.when(pl.col(target) == "").then(None).otherwise(pl.col(target)).alias(target))

        # We will hold the output DataFrame which will just be `df` with new columns
        full_pd = df.to_pandas()
        
        import pandas as pd
        # Force numeric types for odds features that may have been imported as strings due to empty/null values
        for col in full_pd.columns:
            if 'Odds' in col or 'Over' in col or 'Under' in col or 'BTTS_' in col or 'DNB_' in col or 'DC_' in col:
                full_pd[col] = pd.to_numeric(full_pd[col], errors='coerce')
        
        # Enterprise Anti-Leakage: Post-match outcomes that MUST be hidden to prevent cheating
        post_match_outcomes = {
            'FT_HomeScore', 'FT_AwayScore', 
            'HT_HomeScore', 'HT_AwayScore', 
            'SH_HomeScore', 'SH_AwayScore',
            'Match_Status', 'Winner', 'Result'
        }
            
        def store_predictions(raw_preds, is_class, is_poiss, tgt, df_full, msg_suffix=""):
            df_full[f"Predicted_{tgt}"] = raw_preds
            self.log(f"Generated predictions for empty rows{msg_suffix}.")
        
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
            
            # Automatically drop high-cardinality or metadata string columns that cause the model to overfit/fail
            for col in full_pd.columns:
                if col not in features_to_drop and (pd.api.types.is_string_dtype(full_pd[col]) or pd.api.types.is_object_dtype(full_pd[col])):
                    unique_count = full_pd[col].nunique()
                    # Drop Date, Time, URL, and any column with massive unique categories (>50% or >1000)
                    if unique_count > 1000 or 'url' in col.lower() or 'date' in col.lower() or 'time' in col.lower():
                        features_to_drop.add(col)
                        self.log(f"Auto-dropped feature '{col}' (high cardinality or metadata) to prevent overfitting.")

            feature_cols = [c for c in df.columns if c not in features_to_drop]

            self.log(f"--- PREDICTING: {target} ---")
            dropped = list(features_to_drop.intersection(set(df.columns)))
            self.log(f"Preventing data leakage: Dropped {len(dropped)} future outcome variables and metadata.")

            # 1. Convert categories on the FULL dataframe first to prevent XGBoost category mismatch
            for col in feature_cols:
                if pd.api.types.is_string_dtype(full_pd[col]) or pd.api.types.is_object_dtype(full_pd[col]):
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
                    self.log("Auto-detected Poisson task (Count Data). Using Market-Prior Residual Modeling.")
                    # Force cast to float
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
                self.log("Auto-detected Poisson task. Using Market-Prior Residual Modeling.")

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
                
            full_market_lambda = None
            if is_poisson:
                self.log(f"Applying Market-Prior Residual Modeling for {target}")
                market_lambda = np.ones(len(full_pd)) * (1.45 if "Home" in target else 1.15)
                
                # Try to extract from odds if available
                if 'FT_HomeOdds' in full_pd.columns and 'FT_AwayOdds' in full_pd.columns and 'FT_DrawOdds' in full_pd.columns:
                    home_odds = pd.to_numeric(full_pd['FT_HomeOdds'], errors='coerce').replace(0, np.nan)
                    draw_odds = pd.to_numeric(full_pd['FT_DrawOdds'], errors='coerce').replace(0, np.nan)
                    away_odds = pd.to_numeric(full_pd['FT_AwayOdds'], errors='coerce').replace(0, np.nan)
                    
                    prob_h = 1 / home_odds
                    prob_d = 1 / draw_odds
                    prob_a = 1 / away_odds
                    total_prob = prob_h + prob_d + prob_a
                    prob_h /= total_prob
                    prob_d /= total_prob
                    prob_a /= total_prob
                    
                    expected_goals = np.ones(len(full_pd)) * 2.5
                    if 'OU25_Over' in full_pd.columns and 'OU25_Under' in full_pd.columns:
                        over_odds = pd.to_numeric(full_pd['OU25_Over'], errors='coerce').replace(0, np.nan)
                        under_odds = pd.to_numeric(full_pd['OU25_Under'], errors='coerce').replace(0, np.nan)
                        prob_o = 1 / over_odds
                        prob_u = 1 / under_odds
                        total_ou = prob_o + prob_u
                        prob_o /= total_ou
                        expected_goals = 1.0 + prob_o * 3.0
                    
                    market_lambda_H = expected_goals * (prob_h + 0.5 * prob_d)
                    market_lambda_A = expected_goals * (prob_a + 0.5 * prob_d)
                    
                    if "Home" in target:
                        market_lambda = market_lambda_H.fillna(1.45).values
                    else:
                        market_lambda = market_lambda_A.fillna(1.15).values

                train_market_lambda = market_lambda[full_pd[target].notnull()]
                full_market_lambda = market_lambda
                
                # Use base_margin instead of transforming the target
                train_base_margin = np.log(np.maximum(0.05, train_market_lambda))
                full_base_margin = np.log(np.maximum(0.05, full_market_lambda))
                
            # Dynamic Depth based on dataset size
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
                    split_idx = int(len(X_train_full) * 0.8)
                    X_tr, X_te = X_train_full.iloc[:split_idx], X_train_full.iloc[split_idx:]
                    y_tr, y_te = y_train_full.iloc[:split_idx], y_train_full.iloc[split_idx:]
                    
                    if is_classification:
                        eval_model = xgb.XGBClassifier(early_stopping_rounds=30, enable_categorical=True, **params)
                        eval_model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
                        best_iteration = eval_model.best_iteration
                        eval_model.set_params(device="cpu")
                        eval_preds = eval_model.predict(X_te)
                        acc = accuracy_score(y_te, eval_preds) * 100
                        self.log(f"Evaluated Chronological Blind Accuracy: {acc:.2f}%")
                    elif is_poisson:
                        # Scikit-learn API model.fit doesn't support base_margin natively via fit params in all versions, 
                        # so we use xgb.train for Poisson evaluation to pass base_margin properly.
                        tr_margin = train_base_margin[:split_idx]
                        te_margin = train_base_margin[split_idx:]
                        
                        dtrain = xgb.DMatrix(X_tr, label=y_tr, base_margin=tr_margin, enable_categorical=True)
                        dvalid = xgb.DMatrix(X_te, label=y_te, base_margin=te_margin, enable_categorical=True)
                        
                        xgb_params = params.copy()
                        n_ests = xgb_params.pop("n_estimators")
                        eval_model = xgb.train(xgb_params, dtrain, num_boost_round=n_ests, evals=[(dvalid, 'eval')], early_stopping_rounds=30, verbose_eval=False)
                        best_iteration = eval_model.best_iteration
                        
                        eval_preds = eval_model.predict(dvalid)
                        mae = mean_absolute_error(y_te, eval_preds)
                        self.log(f"Evaluated Chronological Blind Error (MAE): {mae:.3f}")
                    else:
                        eval_model = xgb.XGBRegressor(early_stopping_rounds=30, enable_categorical=True, **params)
                        eval_model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
                        best_iteration = eval_model.best_iteration
                        eval_model.set_params(device="cpu")
                        eval_preds = eval_model.predict(X_te)
                        mae = mean_absolute_error(y_te, eval_preds)
                        self.log(f"Evaluated Chronological Blind Error (MAE): {mae:.3f}")
                else:
                    self.log("Skipped Out-of-Sample Evaluation: Not enough historical data (< 10 rows). Proceeding directly to full training & prediction.")

                final_estimators = max(10, int(best_iteration * 1.25))
                params["n_estimators"] = final_estimators
                
                if is_classification:
                        model = xgb.XGBClassifier(enable_categorical=True, **params)
                        model.fit(X_train_full, y_train_full)
                        model.set_params(device="cpu")
                        preds = model.predict(X_full)
                elif is_poisson:
                    # Final train with base_margin
                    dtrain_full = xgb.DMatrix(X_train_full, label=y_train_full, base_margin=train_base_margin, enable_categorical=True)
                    dfull = xgb.DMatrix(X_full, base_margin=full_base_margin, enable_categorical=True)
                    xgb_params = params.copy()
                    n_ests = xgb_params.pop("n_estimators")
                    model = xgb.train(xgb_params, dtrain_full, num_boost_round=n_ests)
                    preds = model.predict(dfull)
                else:
                    model = xgb.XGBRegressor(enable_categorical=True, **params)
                    model.fit(X_train_full, y_train_full)
                    model.set_params(device="cpu")
                    preds = model.predict(X_full)
                
                if is_classification and label_map:
                    reverse_map = {v: k for k, v in label_map.items()}
                    preds = [reverse_map.get(p, p) for p in preds]
                
                store_predictions(preds, is_classification, is_poisson, target, full_pd)
                
                if hasattr(model, 'feature_importances_'):
                    importance = model.feature_importances_
                elif hasattr(model, 'get_score'):
                    importance_dict = model.get_score(importance_type='gain')
                    # Convert dict to array matching feature_cols
                    importance = [importance_dict.get(f, 0.0) for f in feature_cols]
                    total_imp = sum(importance) if sum(importance) > 0 else 1
                    importance = [x / total_imp for x in importance]
                else:
                    importance = [0.0] * len(feature_cols)
                    
                feat_imp = sorted(zip(feature_cols, importance), key=lambda x: x[1], reverse=True)
                self.log("Top Decision Patterns:")
                for f, imp in feat_imp[:5]:
                    self.log(f"  ⭐ {f} ({imp * 100:.1f}% impact)")
                    
            except Exception as e:
                self.log(f"XGBoost GPU failed for {target}: {e}. Retrying on CPU...")
                try:
                    params["device"] = "cpu"
                    if is_classification:
                        model = xgb.XGBClassifier(**params)
                        model.fit(X_train_full, y_train_full)
                        preds = model.predict(X_full)
                    elif is_poisson:
                        dtrain_full = xgb.DMatrix(X_train_full, label=y_train_full, base_margin=train_base_margin, enable_categorical=True)
                        dfull = xgb.DMatrix(X_full, base_margin=full_base_margin, enable_categorical=True)
                        xgb_params = params.copy()
                        n_ests = xgb_params.pop("n_estimators")
                        model = xgb.train(xgb_params, dtrain_full, num_boost_round=n_ests)
                        preds = model.predict(dfull)
                    else:
                        model = xgb.XGBRegressor(**params)
                        model.fit(X_train_full, y_train_full)
                        preds = model.predict(X_full)
                        
                    if is_classification and label_map:
                        reverse_map = {v: k for k, v in label_map.items()}
                        preds = [reverse_map.get(p, p) for p in preds]
                        
                    store_predictions(preds, is_classification, is_poisson, target, full_pd, " using CPU")
                except Exception as inner_e:
                    self.log(f"CPU fallback also failed: {inner_e}")
                    raise

        # 3-Class Classifier for Match Result
        if "FT_HomeScore" in df.columns and "FT_AwayScore" in df.columns:
            self.log("Training dedicated 3-class classifier for Match Result (Home/Draw/Away)...")
            try:
                # 1. Work directly on full_pd using boolean masks to preserve exact index integrity
                valid_score_mask = full_pd["FT_HomeScore"].notnull() & full_pd["FT_AwayScore"].notnull()
                
                if valid_score_mask.sum() > 10:
                    # 2. Derive targets directly from full_pd
                    h_scores = pd.to_numeric(full_pd.loc[valid_score_mask, "FT_HomeScore"], errors='coerce')
                    a_scores = pd.to_numeric(full_pd.loc[valid_score_mask, "FT_AwayScore"], errors='coerce')
                    
                    y_res = np.where(h_scores > a_scores, 0, np.where(h_scores == a_scores, 1, 2))
                    
                    # 3. Identify and encode feature columns
                    features_to_drop_res = {'FT_HomeScore', 'FT_AwayScore', 'HT_HomeScore', 'HT_AwayScore', 
                                            'SH_HomeScore', 'SH_AwayScore', 'Match_Status', 'Winner', 'Result'}
                    for col in full_pd.columns:
                        if col not in features_to_drop_res and (full_pd[col].dtype == 'object' or str(full_pd[col].dtype) == 'string'):
                            if full_pd[col].nunique() > 1000 or 'url' in col.lower() or 'date' in col.lower() or 'time' in col.lower():
                                features_to_drop_res.add(col)
                                
                    feature_cols_res = [c for c in full_pd.columns if c not in features_to_drop_res]
                    
                    for col in feature_cols_res:
                        if full_pd[col].dtype == 'object' or str(full_pd[col].dtype) == 'string':
                            full_pd[col] = full_pd[col].astype('category')
                            
                    # 4. Slice cleanly with the exact boolean mask
                    X_res_train = full_pd.loc[valid_score_mask, feature_cols_res]
                    X_res_full_feats = full_pd[feature_cols_res]
                    
                    res_params = {
                        "tree_method": "hist",
                        "device": "cuda",
                        "learning_rate": 0.05,
                        "max_depth": 6,
                        "n_estimators": 150,
                        "objective": "multi:softprob",
                        "num_class": 3,
                        "random_state": 42
                    }
                    
                    try:
                        model_res = xgb.XGBClassifier(enable_categorical=True, **res_params)
                        model_res.fit(X_res_train, y_res)
                        model_res.set_params(device="cpu")
                        probs = model_res.predict_proba(X_res_full_feats)
                    except Exception as e:
                        self.log(f"Classifier GPU failed: {e}. Falling back to CPU...")
                        res_params["device"] = "cpu"
                        model_res = xgb.XGBClassifier(enable_categorical=True, **res_params)
                        model_res.fit(X_res_train, y_res)
                        probs = model_res.predict_proba(X_res_full_feats)
                        
                    full_pd["Softmax_Prob_Home"] = probs[:, 0]
                    full_pd["Softmax_Prob_Draw"] = probs[:, 1]
                    full_pd["Softmax_Prob_Away"] = probs[:, 2]
                    self.log("Softmax classifier completed successfully with aligned indexes.")
            except Exception as e:
                self.log(f"Failed to train 3-class classifier: {e}")

        # Convert back to Polars
        full_pl = pl.from_pandas(full_pd)
        
        # Determine upcoming matches (rows missing target labels) to output ONLY those
        if target_cols and target_cols[0] in df.columns:
            mask = df[target_cols[0]].is_null()
            upcoming_pl = full_pl.filter(mask)
            
            if len(upcoming_pl) > 0:
                self.log(f"Filtered output from {len(full_pl)} total rows down to {len(upcoming_pl)} Upcoming matches.")
                return upcoming_pl
                
        return full_pl
