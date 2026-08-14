import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode
from scipy.stats import poisson
import math
import html
import pandas as pd

class OddsAnalyzerNode(BaseNode):
    MANIFEST = {
        "id": "odds_analyzer",
        "name": "Odds Analyzer",
        "category": "prep",
        "icon": "TrendingUp",
        "description": "Calculates Match Probabilities & Expected Value (EV) from predicted goals using Poisson Distribution.",
        "ui_schema": [
            {
                "field": "matchIdentifier",
                "label": "Match Identifier Column (e.g. URL or Name)",
                "type": "column_select",
                "default": ""
            },
            {
                "field": "predHomeCol",
                "label": "Predicted Home Goals Column",
                "type": "column_select",
                "default": "Predicted_FT_HomeScore"
            },
            {
                "field": "predAwayCol",
                "label": "Predicted Away Goals Column",
                "type": "column_select",
                "default": "Predicted_FT_AwayScore"
            },
            {
                "field": "oddsHomeCol",
                "label": "Home Win Odds Column (Decimal)",
                "type": "column_select",
                "default": "FT_HomeOdds"
            },
            {
                "field": "oddsDrawCol",
                "label": "Draw Odds Column (Decimal)",
                "type": "column_select",
                "default": "FT_DrawOdds"
            },
            {
                "field": "oddsAwayCol",
                "label": "Away Win Odds Column (Decimal)",
                "type": "column_select",
                "default": "FT_AwayOdds"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Odds Analyzer requires an incoming data stream.")
            
        p_home = self.parameters.get("predHomeCol", "Predicted_FT_HomeScore")
        p_away = self.parameters.get("predAwayCol", "Predicted_FT_AwayScore")
        o_home = self.parameters.get("oddsHomeCol", "FT_HomeOdds")
        o_draw = self.parameters.get("oddsDrawCol", "FT_DrawOdds")
        o_away = self.parameters.get("oddsAwayCol", "FT_AwayOdds")
        match_id = self.parameters.get("matchIdentifier", "")

        # Detect all available personalities
        all_possible = ["", "_Conservative", "_Exciting", "_Underdog", "_Defensive", "_Form-Heavy"]
        active_personalities = []
        for p in all_possible:
            if f"{p_home}{p}" in df.columns and f"{p_away}{p}" in df.columns:
                active_personalities.append(p)

        # Verify columns exist
        if not active_personalities:
            missing = [p_home, p_away]
            return self.graceful_bypass(
                df=df,
                missing_cols=missing,
                expected_config={
                    'Prob Home': p_home, 'Prob Away': p_away,
                    'Odds Home': o_home, 'Odds Draw': o_draw, 'Odds Away': o_away
                }
            )

        pd_df = df.to_pandas()
        
        lists = {p: {
            "home_win_prob": [], "draw_prob": [], "away_win_prob": [],
            "ev_h": [], "ev_d": [], "ev_a": [],
            "most_probable_h": [], "most_probable_a": []
        } for p in active_personalities}

        rho = -0.13  # Standard empirical correlation parameter for professional football leagues

        for idx, row in pd_df.iterrows():
            def safe_float(val, default=0.0):
                try:
                    if pd.isna(val) or val == "": return default
                    return float(val)
                except (ValueError, TypeError):
                    return default
                    
            odds_h = safe_float(row.get(o_home, 0)) if o_home else 0.0
            odds_d = safe_float(row.get(o_draw, 0)) if o_draw else 0.0
            odds_a = safe_float(row.get(o_away, 0)) if o_away else 0.0

            for p in active_personalities:
                lambda_home = safe_float(row.get(f"{p_home}{p}", 0), default=float('nan'))
                lambda_away = safe_float(row.get(f"{p_away}{p}", 0), default=float('nan'))
                
                # Handle nulls
                if math.isnan(lambda_home) or math.isnan(lambda_away):
                    lists[p]["home_win_prob"].append(None)
                    lists[p]["draw_prob"].append(None)
                    lists[p]["away_win_prob"].append(None)
                    lists[p]["ev_h"].append(None)
                    lists[p]["ev_d"].append(None)
                    lists[p]["ev_a"].append(None)
                    lists[p]["most_probable_h"].append(None)
                    lists[p]["most_probable_a"].append(None)
                    continue
                    
                home_win_prob = 0.0
                draw_prob = 0.0
                away_win_prob = 0.0
                max_joint_prob = 0.0
                best_h, best_a = 0, 0

                # Poisson matrix up to 10 goals
                for h in range(10):
                    prob_h = poisson.pmf(h, lambda_home)
                    for a in range(10):
                        prob_a = poisson.pmf(a, lambda_away)
                        joint_prob = prob_h * prob_a
                        
                        # Apply Dixon-Coles adjustment for low scorelines
                        if h == 0 and a == 0:
                            tau = 1.0 - (lambda_home * lambda_away * rho)
                        elif h == 0 and a == 1:
                            tau = 1.0 + (lambda_home * rho)
                        elif h == 1 and a == 0:
                            tau = 1.0 + (lambda_away * rho)
                        elif h == 1 and a == 1:
                            tau = 1.0 - rho
                        else:
                            tau = 1.0
                            
                        joint_prob *= max(0.0, tau)
                        
                        if h > a:
                            home_win_prob += joint_prob
                        elif h == a:
                            draw_prob += joint_prob
                        else:
                            away_win_prob += joint_prob
                            
                        # Track the most probable exact scoreline
                        if joint_prob > max_joint_prob:
                            max_joint_prob = joint_prob
                            best_h = h
                            best_a = a

                # Normalize probabilities so they sum to 1 (accounting for goals > 10 missing mass)
                total = home_win_prob + draw_prob + away_win_prob
                if total > 0:
                    home_win_prob /= total
                    draw_prob /= total
                    away_win_prob /= total

                # Calculate EV (%)
                ev_h = ((home_win_prob * odds_h) - 1) * 100 if odds_h and not math.isnan(odds_h) else 0
                ev_d = ((draw_prob * odds_d) - 1) * 100 if odds_d and not math.isnan(odds_d) else 0
                ev_a = ((away_win_prob * odds_a) - 1) * 100 if odds_a and not math.isnan(odds_a) else 0
                
                lists[p]["home_win_prob"].append(home_win_prob * 100)
                lists[p]["draw_prob"].append(draw_prob * 100)
                lists[p]["away_win_prob"].append(away_win_prob * 100)
                lists[p]["ev_h"].append(ev_h)
                lists[p]["ev_d"].append(ev_d)
                lists[p]["ev_a"].append(ev_a)
                lists[p]["most_probable_h"].append(best_h)
                lists[p]["most_probable_a"].append(best_a)
                
        # Append all computed columns back into the Pandas DataFrame
        for p in active_personalities:
            pd_df[f'Prob_Home{p}'] = lists[p]["home_win_prob"]
            pd_df[f'Prob_Draw{p}'] = lists[p]["draw_prob"]
            pd_df[f'Prob_Away{p}'] = lists[p]["away_win_prob"]
            pd_df[f'EV_Home{p}'] = lists[p]["ev_h"]
            pd_df[f'EV_Draw{p}'] = lists[p]["ev_d"]
            pd_df[f'EV_Away{p}'] = lists[p]["ev_a"]
            pd_df[f'Most_Probable_Home_Score{p}'] = lists[p]["most_probable_h"]
            pd_df[f'Most_Probable_Away_Score{p}'] = lists[p]["most_probable_a"]
            
        report_df = pl.from_pandas(pd_df)
        return report_df
