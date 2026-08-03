import polars as pl
import pandas as pd
import numpy as np
import logging
from typing import Dict, Any
from app.tools.base import BaseNode

logger = logging.getLogger(__name__)

class FootballEngineNode(BaseNode):
    MANIFEST = {
        "id": "football_engine",
        "name": "Football Engine",
        "category": "prep",
        "icon": "Activity",
        "description": "Calculates rolling form, momentum, and historical stats for football matches to make the AI Predictor smarter.",
        "ui_schema": [
            {
                "field": "help",
                "type": "help_text",
                "label": "",
                "content": "<strong>💡 Feature Engineering:</strong> This tool acts as the 'Memory' for your AI. It chronologically sorts your matches and calculates the <em>Past Form</em> (Points/Goals from the last 5 games) for every team right before kick-off, injecting this Football Intelligence into your dataset so the Predictor can learn from it!"
            },
            {
                "field": "dateCol",
                "type": "column_select",
                "label": "Match Date Column",
                "default": "Date"
            },
            {
                "field": "homeTeamCol",
                "type": "column_select",
                "label": "Home Team Column",
                "default": "HomeTeam"
            },
            {
                "field": "awayTeamCol",
                "type": "column_select",
                "label": "Away Team Column",
                "default": "AwayTeam"
            },
            {
                "field": "homeScoreCol",
                "type": "column_select",
                "label": "Home Goals Column (Historical)",
                "default": "FT_HomeScore"
            },
            {
                "field": "awayScoreCol",
                "type": "column_select",
                "label": "Away Goals Column (Historical)",
                "default": "FT_AwayScore"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Football Engine requires an incoming data stream.")

        date_col = self.parameters.get("dateCol", "Date")
        h_team = self.parameters.get("homeTeamCol", "HomeTeam")
        a_team = self.parameters.get("awayTeamCol", "AwayTeam")
        h_score = self.parameters.get("homeScoreCol", "FT_HomeScore")
        a_score = self.parameters.get("awayScoreCol", "FT_AwayScore")

        missing = [c for c in [date_col, h_team, a_team, h_score, a_score] if c and c not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns for Football Engine: {missing}")
            
        pd_df = df.to_pandas()
        
        # Ensure date is parsed
        try:
            pd_df['__engine_date__'] = pd.to_datetime(pd_df[date_col], format='mixed')
        except Exception as e:
            logger.warning(f"Could not parse date column automatically. Try ensuring Date is a valid string format. Error: {e}")
            # Fallback to just string sorting if dates fail to parse, though inaccurate for form.
            pd_df['__engine_date__'] = pd_df[date_col]
            
        # We must preserve the original index so we can map the features back correctly
        pd_df['_orig_idx_'] = pd_df.index
        
        # Sort chronologically so history goes from oldest to newest
        pd_df = pd_df.sort_values('__engine_date__').reset_index(drop=True)
        
        # We will build dictionaries to track every team's chronological match history
        # For each match, BEFORE the match happens, what was their last 5 stats?
        team_history = {}
        
        home_form_5 = []
        away_form_5 = []
        home_momentum_3 = []
        away_momentum_3 = []
        home_leakiness_3 = []
        away_leakiness_3 = []
        
        for idx, row in pd_df.iterrows():
            ht = row.get(h_team)
            at = row.get(a_team)
            
            # --- CALCULATE FEATURES BEFORE WE UPDATE HISTORY WITH CURRENT MATCH ---
            def get_stats(team_name, lookback=5):
                history = team_history.get(team_name, [])
                if not history:
                    return 0, 0, 0 # points, scored, conceded
                recent = history[-lookback:]
                pts = sum(m['points'] for m in recent)
                scored = sum(m['goals_scored'] for m in recent) / len(recent)
                conceded = sum(m['goals_conceded'] for m in recent) / len(recent)
                return pts, scored, conceded
                
            h_pts_5, _, _ = get_stats(ht, lookback=5)
            a_pts_5, _, _ = get_stats(at, lookback=5)
            
            # For momentum and leakiness, we use lookback=3
            _, h_mom_3, h_leak_3 = get_stats(ht, lookback=3)
            _, a_mom_3, a_leak_3 = get_stats(at, lookback=3)
            
            home_form_5.append(h_pts_5)
            away_form_5.append(a_pts_5)
            home_momentum_3.append(h_mom_3)
            away_momentum_3.append(a_mom_3)
            home_leakiness_3.append(h_leak_3)
            away_leakiness_3.append(a_leak_3)
            
            # --- NOW UPDATE HISTORY WITH CURRENT MATCH (IF SCORES ARE KNOWN) ---
            hs = row.get(h_score)
            ascore = row.get(a_score)
            
            if pd.notnull(hs) and pd.notnull(ascore):
                try:
                    hs_val = float(hs)
                    as_val = float(ascore)
                    
                    if hs_val > as_val:
                        h_pts, a_pts = 3, 0
                    elif hs_val == as_val:
                        h_pts, a_pts = 1, 1
                    else:
                        h_pts, a_pts = 0, 3
                        
                    if ht not in team_history: team_history[ht] = []
                    if at not in team_history: team_history[at] = []
                    
                    team_history[ht].append({
                        'goals_scored': hs_val,
                        'goals_conceded': as_val,
                        'points': h_pts
                    })
                    
                    team_history[at].append({
                        'goals_scored': as_val,
                        'goals_conceded': hs_val,
                        'points': a_pts
                    })
                except (ValueError, TypeError):
                    pass # Skip if score is not a number

        # Attach new features
        pd_df['HomeTeam_Form_Last5_Pts'] = home_form_5
        pd_df['AwayTeam_Form_Last5_Pts'] = away_form_5
        pd_df['HomeTeam_Scoring_Momentum_L3'] = home_momentum_3
        pd_df['AwayTeam_Scoring_Momentum_L3'] = away_momentum_3
        pd_df['HomeTeam_Defense_Leak_L3'] = home_leakiness_3
        pd_df['AwayTeam_Defense_Leak_L3'] = away_leakiness_3
        
        # Restore original order
        pd_df = pd_df.sort_values('_orig_idx_').drop(columns=['_orig_idx_', '__engine_date__'])
        
        logger.info("--------------------------------------------------")
        logger.info(f"⚽ FOOTBALL ENGINE: Successfully processed {len(pd_df)} historical matches.")
        logger.info(f"🧠 Intelligence Injected: Attached 6 new 'Form' and 'Momentum' context columns to every match.")
        logger.info(f"🔍 Example Knowledge: The AI now inherently understands if '{h_team}' was on a winning streak before kick-off, rather than just seeing their name in a vacuum.")
        logger.info("--------------------------------------------------")
        
        return pl.from_pandas(pd_df)
