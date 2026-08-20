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
                "label": "Full Time Home Goals (FT_HomeScore)",
                "default": "FT_HomeScore"
            },
            {
                "field": "awayScoreCol",
                "type": "column_select",
                "label": "Full Time Away Goals (FT_AwayScore)",
                "default": "FT_AwayScore"
            },
            {
                "field": "htHomeScoreCol",
                "type": "column_select",
                "label": "Half Time Home Goals (Optional)",
                "default": "HT_HomeScore"
            },
            {
                "field": "htAwayScoreCol",
                "type": "column_select",
                "label": "Half Time Away Goals (Optional)",
                "default": "HT_AwayScore"
            },
            {
                "field": "shHomeScoreCol",
                "type": "column_select",
                "label": "Second Half Home Goals (Optional)",
                "default": "SH_HomeScore"
            },
            {
                "field": "shAwayScoreCol",
                "type": "column_select",
                "label": "Second Half Away Goals (Optional)",
                "default": "SH_AwayScore"
            }
        ]
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Football Engine requires an incoming data stream.")

        pd_df = df.to_pandas()

        date_col = self.parameters.get("dateCol", "Date")
        h_team = self.parameters.get("homeTeamCol", "HomeTeam")
        a_team = self.parameters.get("awayTeamCol", "AwayTeam")
        
        # We will parse out FT, HT, SH scores natively
        time_periods = [
            ('FT', self.parameters.get("homeScoreCol", "FT_HomeScore"), self.parameters.get("awayScoreCol", "FT_AwayScore")),
            ('HT', self.parameters.get("htHomeScoreCol", "HT_HomeScore"), self.parameters.get("htAwayScoreCol", "HT_AwayScore")),
            ('SH', self.parameters.get("shHomeScoreCol", "SH_HomeScore"), self.parameters.get("shAwayScoreCol", "SH_AwayScore"))
        ]

        # Enterprise Graceful Degradation
        missing_cols = []
        if date_col not in pd_df.columns: missing_cols.append(date_col)
        if h_team not in pd_df.columns: missing_cols.append(h_team)
        if a_team not in pd_df.columns: missing_cols.append(a_team)
        
        if missing_cols:
            return self.graceful_bypass(
                df=df, 
                missing_cols=missing_cols, 
                expected_config={'Date': date_col, 'HomeTeam': h_team, 'AwayTeam': a_team}
            )
        
        # Handle unwed rows safely by coercing invalid dates
        pd_df['__engine_date__'] = pd.to_datetime(pd_df[date_col], format='mixed', dayfirst=True, errors='coerce')
        pd_df['_orig_idx_'] = pd_df.index
        
        unwed_rows = pd_df[pd_df['__engine_date__'].isnull()].copy()
        valid_rows = pd_df[pd_df['__engine_date__'].notnull()].copy()
        
        if len(unwed_rows) > 0:
            self.log(f"⚠️ FOOTBALL ENGINE: Found {len(unwed_rows)} unwed rows with missing/invalid dates. They will be bypassed and appended untouched.")
            
        valid_rows = valid_rows.sort_values(by='__engine_date__')
        
        # We process vectorized form using Polars
        pl_valid = pl.from_pandas(valid_rows)
        # We create a monotonically increasing match ID which preserves chronological order
        pl_valid = pl_valid.with_columns(pl.Series("__match_id__", range(len(pl_valid))))
        
        features_added = 0
        
        for prefix, h_score_col, a_score_col in time_periods:
            if h_score_col in pl_valid.columns and a_score_col in pl_valid.columns:
                
                # Stack Home and Away teams vertically to create a longitudinal dataframe
                home_stats = pl_valid.select([
                    pl.col("__match_id__"), 
                    pl.col("__engine_date__"),
                    pl.col(h_team).alias("team"),
                    pl.col(h_score_col).cast(pl.Float64).alias("goals_scored"),
                    pl.col(a_score_col).cast(pl.Float64).alias("goals_conceded")
                ])
                away_stats = pl_valid.select([
                    pl.col("__match_id__"), 
                    pl.col("__engine_date__"),
                    pl.col(a_team).alias("team"),
                    pl.col(a_score_col).cast(pl.Float64).alias("goals_scored"),
                    pl.col(h_score_col).cast(pl.Float64).alias("goals_conceded")
                ])
                
                team_stats = pl.concat([home_stats, away_stats])
                
                # We only want to compute rolling history on matches that actually happened (scores not null)
                valid_history = team_stats.filter(pl.col("goals_scored").is_not_null() & pl.col("goals_conceded").is_not_null())
                valid_history = valid_history.with_columns([
                    pl.when(pl.col("goals_scored") > pl.col("goals_conceded")).then(3)
                      .when(pl.col("goals_scored") == pl.col("goals_conceded")).then(1)
                      .otherwise(0).alias("points")
                ])
                
                # Ensure it's correctly sorted by team and match sequence
                valid_history = valid_history.sort(["team", "__engine_date__", "__match_id__"])
                
                # Compute 14-day rolling games played safely via Pandas to prevent Polars indexing deadlocks
                try:
                    vh_pd = valid_history.select(["team", "__engine_date__", "__match_id__"]).to_pandas()
                    vh_pd["__engine_date__"] = pd.to_datetime(vh_pd["__engine_date__"], errors='coerce').fillna(pd.Timestamp("1970-01-01"))
                    vh_pd = vh_pd.sort_values(["team", "__engine_date__", "__match_id__"]).reset_index(drop=True)
                    
                    res = vh_pd.groupby("team").rolling("14D", on="__engine_date__", closed="right")["__match_id__"].count()
                    vh_pd["curr_Games_Played_L14D"] = res.values
                    
                    games_l14_pl = pl.DataFrame(vh_pd[["__match_id__", "team", "curr_Games_Played_L14D"]])
                    valid_history = valid_history.join(games_l14_pl, on=["__match_id__", "team"], how="left")
                except Exception as e:
                    self.log(f"Warning: Could not compute L14D rolling count safely: {e}")
                    valid_history = valid_history.with_columns(pl.lit(0).alias("curr_Games_Played_L14D"))
                
                # Calculate rolling stats (inclusive of the current match)
                valid_history = valid_history.with_columns([
                    pl.col("points").rolling_sum(window_size=5, min_samples=1).over("team").alias("curr_Form_Last5_Pts"),
                    pl.col("goals_scored").rolling_mean(window_size=3, min_samples=1).over("team").alias("curr_Scoring_Momentum_L3"),
                    pl.col("goals_conceded").rolling_mean(window_size=3, min_samples=1).over("team").alias("curr_Defense_Leak_L3"),
                ])
                
                # Shift by 1 to represent stats *prior* to the match
                valid_history = valid_history.with_columns([
                    pl.col("curr_Form_Last5_Pts").shift(1).over("team").fill_null(0.0).alias("Form_Last5_Pts"),
                    pl.col("curr_Scoring_Momentum_L3").shift(1).over("team").fill_null(0.0).alias("Scoring_Momentum_L3"),
                    pl.col("curr_Defense_Leak_L3").shift(1).over("team").fill_null(0.0).alias("Defense_Leak_L3"),
                    pl.col("curr_Games_Played_L14D").shift(1).over("team").fill_null(0).alias("Games_Played_L14D"),
                ])
                
                # For future matches (null scores), we need the most recent stats prior to it
                future_matches = team_stats.filter(pl.col("goals_scored").is_null() | pl.col("goals_conceded").is_null())
                
                if len(future_matches) > 0:
                    valid_for_asof = valid_history.select(["team", "__match_id__", "curr_Form_Last5_Pts", "curr_Scoring_Momentum_L3", "curr_Defense_Leak_L3", "curr_Games_Played_L14D"]).sort("__match_id__")
                    # Tell Polars the data is explicitly sorted to prevent UserWarning
                    try:
                        valid_for_asof = valid_for_asof.set_sorted("__match_id__")
                    except AttributeError:
                        pass
                        
                    future_for_asof = future_matches.select(["team", "__match_id__"]).sort("__match_id__")
                    try:
                        future_for_asof = future_for_asof.set_sorted("__match_id__")
                    except AttributeError:
                        pass
                    
                    # Backward asof join gives us the most recent valid match's "current" stats
                    import warnings
                    with warnings.catch_warnings():
                        warnings.filterwarnings("ignore", category=UserWarning, message="Sortedness of columns cannot be checked.*")
                        joined_futures = future_for_asof.join_asof(
                            valid_for_asof, on="__match_id__", by="team", strategy="backward"
                        ).with_columns([
                            pl.col("curr_Form_Last5_Pts").fill_null(0.0).alias("Form_Last5_Pts"),
                            pl.col("curr_Scoring_Momentum_L3").fill_null(0.0).alias("Scoring_Momentum_L3"),
                            pl.col("curr_Defense_Leak_L3").fill_null(0.0).alias("Defense_Leak_L3"),
                            pl.col("curr_Games_Played_L14D").fill_null(0).alias("Games_Played_L14D"),
                        ]).select(["__match_id__", "team", "Form_Last5_Pts", "Scoring_Momentum_L3", "Defense_Leak_L3", "Games_Played_L14D"])
                    
                    all_features = pl.concat([
                        valid_history.select(["__match_id__", "team", "Form_Last5_Pts", "Scoring_Momentum_L3", "Defense_Leak_L3", "Games_Played_L14D"]),
                        joined_futures
                    ])
                else:
                    all_features = valid_history.select(["__match_id__", "team", "Form_Last5_Pts", "Scoring_Momentum_L3", "Defense_Leak_L3", "Games_Played_L14D"])
                
                # Join rolling features back to the main dataframe for Home and Away
                pl_valid = pl_valid.join(
                    all_features.rename({
                        "team": h_team,
                        "Form_Last5_Pts": f"{prefix}_HomeTeam_Form_Last5_Pts",
                        "Scoring_Momentum_L3": f"{prefix}_HomeTeam_Scoring_Momentum_L3",
                        "Defense_Leak_L3": f"{prefix}_HomeTeam_Defense_Leak_L3",
                        "Games_Played_L14D": f"{prefix}_HomeTeam_Games_Played_L14D",
                    }),
                    left_on=["__match_id__", h_team], right_on=["__match_id__", h_team],
                    how="left"
                )
                
                pl_valid = pl_valid.join(
                    all_features.rename({
                        "team": a_team,
                        "Form_Last5_Pts": f"{prefix}_AwayTeam_Form_Last5_Pts",
                        "Scoring_Momentum_L3": f"{prefix}_AwayTeam_Scoring_Momentum_L3",
                        "Defense_Leak_L3": f"{prefix}_AwayTeam_Defense_Leak_L3",
                        "Games_Played_L14D": f"{prefix}_AwayTeam_Games_Played_L14D",
                    }),
                    left_on=["__match_id__", a_team], right_on=["__match_id__", a_team],
                    how="left"
                )
                
                features_added += 8
                
        # Re-attach unwed rows
        valid_rows = pl_valid.to_pandas()
        pd_df = pd.concat([valid_rows, unwed_rows], ignore_index=False)
        pd_df = pd_df.sort_values('_orig_idx_').drop(columns=['_orig_idx_', '__engine_date__', '__match_id__'], errors='ignore')
        
        # Calculate Vig-Free Implied Probabilities from Odds
        if 'FT_HomeOdds' in pd_df.columns and 'FT_AwayOdds' in pd_df.columns and 'FT_DrawOdds' in pd_df.columns:
            import numpy as np
            h_odds = pd.to_numeric(pd_df['FT_HomeOdds'], errors='coerce').replace(0, np.nan)
            d_odds = pd.to_numeric(pd_df['FT_DrawOdds'], errors='coerce').replace(0, np.nan)
            a_odds = pd.to_numeric(pd_df['FT_AwayOdds'], errors='coerce').replace(0, np.nan)
            
            raw_h = 1.0 / h_odds
            raw_d = 1.0 / d_odds
            raw_a = 1.0 / a_odds
            total_margin = raw_h + raw_d + raw_a
            
            # Margin-adjusted market probabilities
            pd_df['Market_Prob_Home'] = raw_h / total_margin
            pd_df['Market_Prob_Draw'] = raw_d / total_margin
            pd_df['Market_Prob_Away'] = raw_a / total_margin
            
            # Market Implied Spread (Team Strength Delta)
            pd_df['Market_Strength_Delta'] = pd_df['Market_Prob_Home'] - pd_df['Market_Prob_Away']
            
            features_added += 4

        self.log("--------------------------------------------------")
        self.log(f"🧠 FOOTBALL ENGINE: Successfully processed {len(valid_rows)} historical matches.")
        self.log(f"⚡ Intelligence Injected: Attached {features_added} new context columns natively via Polars.")
        self.log("--------------------------------------------------")
        
        return pl.from_pandas(pd_df)
