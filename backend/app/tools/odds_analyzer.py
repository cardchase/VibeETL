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
        "description": "Calculates Match Probabilities & Expected Value (EV) from predicted goals using Poisson Distribution, blending with Classifier logic.",
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

        # Verify core columns exist
        if p_home not in df.columns or p_away not in df.columns:
            return self.graceful_bypass(
                df=df,
                missing_cols=[p_home, p_away],
                expected_config={
                    'Prob Home': p_home, 'Prob Away': p_away,
                    'Odds Home': o_home, 'Odds Draw': o_draw, 'Odds Away': o_away
                }
            )

        pd_df = df.to_pandas()
        
        home_win_probs = []
        draw_probs = []
        away_win_probs = []
        ev_hs = []
        ev_ds = []
        ev_as = []
        most_probable_hs = []
        most_probable_as = []

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

            lambda_home = safe_float(row.get(p_home, 0), default=float('nan'))
            lambda_away = safe_float(row.get(p_away, 0), default=float('nan'))
            
            # Handle nulls
            if math.isnan(lambda_home) or math.isnan(lambda_away):
                home_win_probs.append(None)
                draw_probs.append(None)
                away_win_probs.append(None)
                ev_hs.append(None)
                ev_ds.append(None)
                ev_as.append(None)
                most_probable_hs.append(None)
                most_probable_as.append(None)
                continue
                
            poisson_h_prob = 0.0
            poisson_d_prob = 0.0
            poisson_a_prob = 0.0
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
                        poisson_h_prob += joint_prob
                    elif h == a:
                        poisson_d_prob += joint_prob
                    else:
                        poisson_a_prob += joint_prob
                        
                    # Track the most probable exact scoreline
                    if joint_prob > max_joint_prob:
                        max_joint_prob = joint_prob
                        best_h = h
                        best_a = a

            # Normalize Poisson probabilities so they sum to 1
            total = poisson_h_prob + poisson_d_prob + poisson_a_prob
            if total > 0:
                poisson_h_prob /= total
                poisson_d_prob /= total
                poisson_a_prob /= total

            # Direct Outcome Probability Blend (Softmax + Poisson)
            softmax_h = safe_float(row.get('Softmax_Prob_Home', float('nan')))
            softmax_d = safe_float(row.get('Softmax_Prob_Draw', float('nan')))
            softmax_a = safe_float(row.get('Softmax_Prob_Away', float('nan')))

            if not math.isnan(softmax_h) and not math.isnan(softmax_d) and not math.isnan(softmax_a):
                final_h_prob = 0.5 * poisson_h_prob + 0.5 * softmax_h
                final_d_prob = 0.5 * poisson_d_prob + 0.5 * softmax_d
                final_a_prob = 0.5 * poisson_a_prob + 0.5 * softmax_a
                
                # Re-normalize just in case
                total_final = final_h_prob + final_d_prob + final_a_prob
                if total_final > 0:
                    final_h_prob /= total_final
                    final_d_prob /= total_final
                    final_a_prob /= total_final
            else:
                final_h_prob = poisson_h_prob
                final_d_prob = poisson_d_prob
                final_a_prob = poisson_a_prob

            # Calculate EV (%)
            raw_ev_h = ((final_h_prob * odds_h) - 1) * 100 if odds_h and not math.isnan(odds_h) else 0
            raw_ev_d = ((final_d_prob * odds_d) - 1) * 100 if odds_d and not math.isnan(odds_d) else 0
            raw_ev_a = ((final_a_prob * odds_a) - 1) * 100 if odds_a and not math.isnan(odds_a) else 0
            
            # Kelly Criterion & Dynamic EV Dampening for Longshots
            # If odds > 5.0, apply dampening to penalize high variance/uncertainty
            def dampen_ev(ev, odds):
                if ev <= 0 or odds <= 5.0:
                    return ev
                penalty_factor = 0.3
                dampening = 1.0 + max(0, odds - 5.0) * penalty_factor
                return ev / dampening

            ev_h = dampen_ev(raw_ev_h, odds_h)
            ev_d = dampen_ev(raw_ev_d, odds_d)
            ev_a = dampen_ev(raw_ev_a, odds_a)

            home_win_probs.append(final_h_prob * 100)
            draw_probs.append(final_d_prob * 100)
            away_win_probs.append(final_a_prob * 100)
            ev_hs.append(ev_h)
            ev_ds.append(ev_d)
            ev_as.append(ev_a)
            most_probable_hs.append(best_h)
            most_probable_as.append(best_a)
            
        # Append all computed columns back into the Pandas DataFrame
        pd_df['Prob_Home'] = home_win_probs
        pd_df['Prob_Draw'] = draw_probs
        pd_df['Prob_Away'] = away_win_probs
        pd_df['EV_Home'] = ev_hs
        pd_df['EV_Draw'] = ev_ds
        pd_df['EV_Away'] = ev_as
        pd_df['Most_Probable_Home_Score'] = most_probable_hs
        pd_df['Most_Probable_Away_Score'] = most_probable_as
            
        report_df = pl.from_pandas(pd_df)
        return report_df
