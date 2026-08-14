import polars as pl
import pandas as pd
import logging
from typing import Dict, Any
from app.tools.base import BaseNode

logger = logging.getLogger(__name__)

def generate_reality_check_narrative(home, away, ft_h, ft_a, h_odds, a_odds, market_delta=None):
    """Reconciles model predictions with real-world bookmaker odds context."""
    narrative_parts = []
    
    if pd.isna(ft_h) or pd.isna(ft_a) or ft_h == "" or ft_a == "":
        return ""
        
    try:
        fh_raw = float(ft_h)
        fa_raw = float(ft_a)
    except (ValueError, TypeError):
        return ""
        
    try:
        ho = float(h_odds) if pd.notna(h_odds) and h_odds != "" else 2.0
    except (ValueError, TypeError):
        ho = 2.0
        
    try:
        ao = float(a_odds) if pd.notna(a_odds) and a_odds != "" else 2.0
    except (ValueError, TypeError):
        ao = 2.0

    # 1. Heavily Favored Home Side + Low Opponent xG -> Win to Nil Call
    if ho <= 1.35 and fa_raw < 0.8:
        narrative_parts.append(
            f"💡 **Reality Check:** Market odds ({ho:.2f}) heavily favor {home}. "
            f"With {away}'s expected goals suppressed at {fa_raw:.2f}, the highest-value angle is **{home} Win to Nil** or **{home} -1.5 Handicap**."
        )
    # 2. Tight Odds + High Variance -> Both Teams To Score / Over Call
    elif 2.0 <= ho <= 2.8 and 2.0 <= ao <= 2.8 and (fh_raw + fa_raw) >= 2.7:
        narrative_parts.append(
            f"💡 **Reality Check:** Bookmakers expect a tight contest ({ho:.2f} vs {ao:.2f}). "
            f"Rather than taking a risky match result, the data highlights **Both Teams to Score (BTTS - Yes)** as the primary target."
        )
    # 3. Model/Odds Mismatch (Upset Opportunity)
    elif ho > 2.5 and fh_raw > fa_raw + 0.5:
        narrative_parts.append(
            f"🔥 **Model Edge Detected:** Bookmakers are underestimating {home} at {ho:.2f}. "
            f"The model identifies strong underlying metrics backing a **{home} Draw No Bet (DNB)** value play."
        )
    # 4. The Contrarian Masterclass (Heavy Favorite vs. Engine Upset)
    elif ho <= 1.50 and ao >= 4.50 and fa_raw > fh_raw:
        narrative_parts.append(
            f"🚨 **Upset Alert:** The market is heavily favoring {home} at {ho:.2f}, setting the perfect trap. "
            f"The Engine's underlying metrics show {home} is vastly overvalued today. "
            f"Spotting a massive statistical edge, the model boldly predicts {away} to pull off a stunning {fa_raw:.0f}-{fh_raw:.0f} smash-and-grab. "
            f"At odds of {ao:.2f}, the betting value here is undeniable."
        )
        
    return " ".join(narrative_parts)

def calculate_confidence_stars(ev_val, prob_val, odds_val):
    """Calculates a 1 to 5 star rating balancing absolute likelihood with market edge."""
    try:
        ev = float(ev_val) if pd.notna(ev_val) and str(ev_val).strip() != "" else 0.0
        prob = float(prob_val) if pd.notna(prob_val) and str(prob_val).strip() != "" else 0.0
        odds = float(odds_val) if pd.notna(odds_val) and str(odds_val).strip() != "" else 2.0
    except (ValueError, TypeError):
        return 1 
        
    stars = 1
    
    # 1. Base Confidence (The Positional Strength)
    if prob >= 65.0: stars = 4
    elif prob >= 50.0: stars = 3
    elif prob >= 35.0: stars = 2
        
    # 2. Market Calibration (The Value Overlay)
    if odds <= 1.45:
        # Heavy favorites suffer from ML shrinkage; be forgiving of negative EV
        if ev >= -15.0: stars += 1
        elif ev < -30.0: stars -= 1
    else:
        # Standard matches
        if ev >= 5.0: stars += 1
        elif ev < -15.0: stars -= 1
        
    return min(5, max(1, stars))

class SoccerReaderNode(BaseNode):
    MANIFEST = {
        "id": "soccer_reader",
        "name": "Soccer Predictor Reader",
        "category": "ai",
        "icon": "MessageSquare",
        "description": "Transforms Engine predictions and odds into a rich, human-readable Scout Report narrative.",
        "ui_schema": [
            {
                "field": "help",
                "type": "help_text",
                "label": "",
                "content": "<strong>📖 Engine Pundit:</strong> This tool creates a rich Scout Report narrative. <br><br><strong>💡 Pro Tip:</strong> You don't need to select a specific personality column! If you select the base column (e.g. <code>Predicted_FT_HomeScore</code>), this node will automatically detect all personalities (Conservative, Exciting, etc.) and generate narratives for ALL of them simultaneously!"
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
                "field": "ftHomePredCol",
                "type": "column_select",
                "label": "Predicted FT Home Score (Optional)",
                "default": "Predicted_FT_HomeScore"
            },
            {
                "field": "ftAwayPredCol",
                "type": "column_select",
                "label": "Predicted FT Away Score (Optional)",
                "default": "Predicted_FT_AwayScore"
            },
            {
                "field": "htHomePredCol",
                "type": "column_select",
                "label": "Predicted HT Home Score (Optional)",
                "default": "Predicted_HT_HomeScore"
            },
            {
                "field": "htAwayPredCol",
                "type": "column_select",
                "label": "Predicted HT Away Score (Optional)",
                "default": "Predicted_HT_AwayScore"
            },
            {
                "field": "shHomePredCol",
                "type": "column_select",
                "label": "Predicted SH Home Score (Optional)",
                "default": "Predicted_SH_HomeScore"
            },
            {
                "field": "shAwayPredCol",
                "type": "column_select",
                "label": "Predicted SH Away Score (Optional)",
                "default": "Predicted_SH_AwayScore"
            },
            {
                "field": "homeOddsCol",
                "type": "column_select",
                "label": "Home Win Odds (Optional)",
                "default": "B365H"
            },
            {
                "field": "awayOddsCol",
                "type": "column_select",
                "label": "Away Win Odds (Optional)",
                "default": "B365A"
            }
        ],
        "defaultParams": {
            "homeTeamCol": "HomeTeam",
            "awayTeamCol": "AwayTeam",
            "ftHomePredCol": "Predicted_FT_HomeScore",
            "ftAwayPredCol": "Predicted_FT_AwayScore",
            "htHomePredCol": "Predicted_HT_HomeScore",
            "htAwayPredCol": "Predicted_HT_AwayScore",
            "shHomePredCol": "Predicted_SH_HomeScore",
            "shAwayPredCol": "Predicted_SH_AwayScore",
            "homeOddsCol": "B365H",
            "awayOddsCol": "B365A"
        }
    }

    def execute(self, inputs: Dict[str, pl.DataFrame]) -> pl.DataFrame:
        df = inputs.get("input")
        if df is None:
            raise ValueError("Soccer Predictor Reader requires an incoming data stream.")

        home_team_col = self.parameters.get("homeTeamCol")
        away_team_col = self.parameters.get("awayTeamCol")
        ft_h_col = self.parameters.get("ftHomePredCol")
        ft_a_col = self.parameters.get("ftAwayPredCol")
        ht_h_col = self.parameters.get("htHomePredCol")
        ht_a_col = self.parameters.get("htAwayPredCol")
        sh_h_col = self.parameters.get("shHomePredCol")
        sh_a_col = self.parameters.get("shAwayPredCol")
        h_odds_col = self.parameters.get("homeOddsCol")
        a_odds_col = self.parameters.get("awayOddsCol")

        columns = df.columns
        if home_team_col not in columns or away_team_col not in columns:
            logger.warning(f"Soccer Reader: Missing Team columns {home_team_col} or {away_team_col}")
            return df

        personalities = ["Conservative", "Exciting", "Underdog", "Defensive", "Form-Heavy"]
        has_personalities = any(f"{ft_h_col}_{p}" in columns for p in personalities)
        
        h_form_key = 'FT_HomeTeam_Form_Last5_Pts' if 'FT_HomeTeam_Form_Last5_Pts' in columns else 'HomeTeam_Form_Last5_Pts'
        a_form_key = 'FT_AwayTeam_Form_Last5_Pts' if 'FT_AwayTeam_Form_Last5_Pts' in columns else 'AwayTeam_Form_Last5_Pts'
        
        def get_prediction_narrative(fh, fa, hp, ap, h_name, a_name, p_type, country="", competition=""):
            # Map countries to their adjectives for more natural phrasing
            country_adj_map = {
                "England": "English",
                "Spain": "Spanish",
                "Italy": "Italian",
                "Germany": "German",
                "France": "French",
                "Brazil": "Brazilian",
                "Portugal": "Portuguese",
                "Netherlands": "Dutch",
                "Scotland": "Scottish",
                "USA": "American",
                "Argentina": "Argentinian",
                "Mexico": "Mexican",
                "Belgium": "Belgian",
                "Turkey": "Turkish",
                "Greece": "Greek",
                "Switzerland": "Swiss",
                "Austria": "Austrian",
                "Denmark": "Danish",
                "Sweden": "Swedish",
                "Norway": "Norwegian",
                "Japan": "Japanese",
                "Australia": "Australian"
            }
            adj_country = country_adj_map.get(country.strip(), country) if country else ""

            # Build a dynamic intro string based on available location data
            if adj_country and competition:
                loc_str = f"In this highly anticipated {adj_country} {competition} clash between {h_name} and {a_name}, "
            elif competition:
                loc_str = f"In this exciting {competition} fixture between {h_name} and {a_name}, "
            elif adj_country:
                loc_str = f"In this upcoming {adj_country} matchup between {h_name} and {a_name}, "
            else:
                loc_str = f"In this upcoming matchup between {h_name} and {a_name}, "

            if p_type == "Conservative":
                if fh > fa:
                    pred_str = f"taking a balanced, data-driven approach, the Conservative model expects {h_name} to secure a {fh}-{fa} victory." if hp >= ap else f"despite recent form, the Conservative model sees enough underlying metrics to back {h_name} for a {fh}-{fa} win."
                elif fa > fh:
                    pred_str = f"trusting the fundamentals, the Conservative model backs {a_name} to pull off a {fa}-{fh} away win." if ap >= hp else f"the Conservative model predicts a gritty {fa}-{fh} away victory for {a_name}."
                else:
                    pred_str = f"the Conservative model anticipates a tightly contested {fh}-{fa} draw, reflecting the evenly matched underlying stats."
            elif p_type == "Exciting":
                if fh > fa:
                    pred_str = f"focusing purely on attacking potential, the Exciting model tips {h_name} to unleash their firepower in a {fh}-{fa} thriller."
                elif fa > fh:
                    pred_str = f"expect an entertaining, high-tempo clash! The Exciting model predicts {a_name} will outgun their hosts in a {fa}-{fh} victory."
                else:
                    pred_str = f"with both teams expected to play expansively, the Exciting model forecasts an action-packed {fh}-{fa} draw."
            elif p_type == "Underdog":
                if fh > fa:
                    pred_str = f"hunting for value, the Underdog model sees a unique edge for {h_name}, predicting a {fh}-{fa} win."
                elif fa > fh:
                    pred_str = f"spotting a potential upset, the Underdog model boldly backs {a_name} to defy the odds with a {fa}-{fh} away win."
                else:
                    pred_str = f"the Underdog model suggests {a_name} has what it takes to frustrate {h_name}, predicting a resilient {fh}-{fa} draw."
            elif p_type == "Defensive":
                if fh > fa:
                    pred_str = f"prioritizing defensive solidity, the Defensive model expects {h_name} to grind out a narrow {fh}-{fa} win."
                elif fa > fh:
                    pred_str = f"built on a low-block mentality, the Defensive model forecasts {a_name} to snatch a tight {fa}-{fh} away victory."
                else:
                    pred_str = f"expecting a cagey affair with minimal chances, the Defensive model strongly predicts a low-scoring {fh}-{fa} draw."
            elif p_type == "Form-Heavy":
                if fh > fa:
                    pred_str = f"riding the wave of recent momentum, the Form-Heavy model backs {h_name} to cruise to a {fh}-{fa} win."
                elif fa > fh:
                    pred_str = f"respecting current trajectories, the Form-Heavy model tips the in-form {a_name} for a {fa}-{fh} away victory."
                else:
                    pred_str = f"with recent form failing to separate the sides, the Form-Heavy model settles on a {fh}-{fa} draw."
            else: # Base / Engine
                if fh > fa:
                    if hp > ap:
                        pred_str = f"the Engine tips {h_name} to secure a {fh}-{fa} victory."
                    elif hp == ap:
                        pred_str = f"expecting a tight, tactical affair, the Engine predicts {h_name} edging out {a_name} for a narrow {fh}-{fa} win."
                    else:
                        pred_str = f"the Engine sees {h_name} overcoming their poor form to grab a {fh}-{fa} win."
                elif fa > fh:
                    if ap > hp:
                        pred_str = f"expect fireworks from the visitors as the Engine expects {a_name} to outgun {h_name} in an entertaining {fa}-{fh} away win."
                    else:
                        pred_str = f"a gritty away performance is on the cards. The Engine predicts {a_name} to grind out a {fa}-{fh} victory against {h_name}."
                else:
                    if hp + ap == 0:
                        pred_str = f"this match has all the makings of a defensive stalemate, with the Engine predicting a 0-0 draw."
                    else:
                        pred_str = f"a closely fought battle is expected, with the Engine pointing towards a highly competitive {fh}-{fa} draw."

            return loc_str + pred_str

        def process_row_for_narrative(row: dict, p_suffix: str, prefix: str) -> str:
            home = row.get(home_team_col)
            away = row.get(away_team_col)
            if not home or not away:
                return ""
                
            country = row.get("Country", "")
            competition = row.get("Competition", "")
            
            loc_intro = ""
            if country and competition:
                loc_intro = f"In this {country} {competition} fixture, "
            elif competition:
                loc_intro = f"In this {competition} clash, "
            elif country:
                loc_intro = f"In this {country} matchup, "
            
            h_odds = row.get(h_odds_col) if h_odds_col in row else None
            a_odds = row.get(a_odds_col) if a_odds_col in row else None
            
            h_form = row.get(h_form_key) if h_form_key in row else None
            a_form = row.get(a_form_key) if a_form_key in row else None
            
            try:
                h_pts = float(h_form) if h_form is not None and h_form != "" else 0.0
            except (ValueError, TypeError):
                h_pts = 0.0
                
            try:
                a_pts = float(a_form) if a_form is not None and a_form != "" else 0.0
            except (ValueError, TypeError):
                a_pts = 0.0
                
            base_parts = []
            
            cur_ft_h_col = f"{ft_h_col}_{p_suffix}" if p_suffix else ft_h_col
            cur_ft_a_col = f"{ft_a_col}_{p_suffix}" if p_suffix else ft_a_col
            cur_ht_h_col = f"{ht_h_col}_{p_suffix}" if p_suffix else ht_h_col
            cur_ht_a_col = f"{ht_a_col}_{p_suffix}" if p_suffix else ht_a_col
            cur_sh_h_col = f"{sh_h_col}_{p_suffix}" if p_suffix else sh_h_col
            cur_sh_a_col = f"{sh_a_col}_{p_suffix}" if p_suffix else sh_a_col
            
            cur_ft_h = row.get(cur_ft_h_col)
            cur_ft_a = row.get(cur_ft_a_col)
            cur_ht_h = row.get(cur_ht_h_col)
            cur_ht_a = row.get(cur_ht_a_col)
            cur_sh_h = row.get(cur_sh_h_col)
            cur_sh_a = row.get(cur_sh_a_col)
            
            if pd.notna(cur_ft_h) and pd.notna(cur_ft_a) and cur_ft_h != "" and cur_ft_a != "":
                try:
                    # Check for Most Probable Scores (Modes) from Odds Analyzer
                    mp_h_col = f"Most_Probable_Home_Score_{p_suffix}" if p_suffix else "Most_Probable_Home_Score"
                    mp_a_col = f"Most_Probable_Away_Score_{p_suffix}" if p_suffix else "Most_Probable_Away_Score"
                    
                    mp_h = row.get(mp_h_col)
                    mp_a = row.get(mp_a_col)
                    
                    # Fallback to base modes if we are processing base or Conservative
                    if mp_h is None and p_suffix in ["", "Conservative"]:
                        mp_h = row.get("Most_Probable_Home_Score")
                        mp_a = row.get("Most_Probable_Away_Score")
                        
                    if mp_h is not None and mp_a is not None and pd.notna(mp_h) and pd.notna(mp_a):
                        fh = int(mp_h)
                        fa = int(mp_a)
                    else:
                        fh = int(round(float(cur_ft_h)))
                        fa = int(round(float(cur_ft_a)))
                        
                    base_parts.append(get_prediction_narrative(fh, fa, h_pts, a_pts, home, away, prefix, country, competition))
                except (ValueError, TypeError):
                    base_parts.append(f"{loc_intro}{prefix} is analyzing the clash between {home} and {away}.")
                    return " ".join(base_parts)
            else:
                base_parts.append(f"{loc_intro}{prefix} is analyzing the clash between {home} and {away}.")
                return " ".join(base_parts)

            # --- 1. Momentum / Form Logic ---
            # Only the Form-Heavy and Conservative models should obsess over historical momentum
            if p_suffix in ["", "Conservative", "Form-Heavy"] and pd.notna(h_form) and pd.notna(a_form) and h_form != "" and a_form != "":
                if h_pts >= 12 and a_pts < 5:
                    base_parts.append(f"Form context: {home} has been on an absolute tear recently, while {away} is struggling immensely.")
                elif a_pts >= 12 and h_pts < 5:
                    base_parts.append(f"Form context: {away} is riding a massive wave of momentum, whereas {home} has been in dismal form.")

            # --- 2. HT/SH Logic (Attacking Surges) ---
            # Only the Exciting model cares about second-half surges and high-tempo halves
            if p_suffix == "Exciting" and pd.notna(cur_ht_h) and pd.notna(cur_ht_a) and cur_ht_h != "" and cur_ht_a != "":
                try:
                    hh = float(cur_ht_h)
                    ha = float(cur_ht_a)
                    h_2nd_half = float(cur_sh_h) if pd.notna(cur_sh_h) and cur_sh_h != "" else (fh - hh)
                    a_2nd_half = float(cur_sh_a) if pd.notna(cur_sh_a) and cur_sh_a != "" else (fa - ha)
                    if h_2nd_half > a_2nd_half and h_2nd_half >= 1.0:
                        base_parts.append(f"Watch for a massive 2nd half surge from {home}, who are notoriously strong finishers in this scenario.")
                    elif a_2nd_half > h_2nd_half and a_2nd_half >= 1.0:
                        base_parts.append(f"The 2nd half is where {away} really turns up the heat, expecting to outscore their opponents after the break.")
                except (ValueError, TypeError):
                    pass

            # --- 3. Odds & Upset Logic ---
            # Only the Underdog model should explicitly call out betting value on massive outsiders
            if p_suffix == "Underdog" and pd.notna(h_odds) and pd.notna(a_odds) and h_odds != "" and a_odds != "":
                try:
                    ho = float(h_odds)
                    ao = float(a_odds)
                    if fh < fa and ao > 2.5:
                        base_parts.append(f"A huge underdog opportunity! At odds of {ao:.2f}, {away} is a highly lucrative pick.")
                    elif fh > fa and ho > 2.5:
                        base_parts.append(f"Spotting massive market disrespect, {home} represents tremendous home-dog value at {ho:.2f}.")
                except (ValueError, TypeError):
                    pass
                    
            # Inject Reality Check Engine (Only for Grounded Models)
            if p_suffix in ["", "Conservative", "Form-Heavy"]:
                reality_check = generate_reality_check_narrative(home, away, cur_ft_h, cur_ft_a, h_odds, a_odds)
                if reality_check:
                    base_parts.append(reality_check)
                
            # Inject Confidence Stars
            try:
                cur_ev_h = row.get(f"EV_Home_{p_suffix}", 0.0) if p_suffix else row.get("EV_Home", 0.0)
                cur_prob_h = row.get(f"Prob_Home_{p_suffix}", 0.0) if p_suffix else row.get("Prob_Home", 0.0)
                cur_ev_a = row.get(f"EV_Away_{p_suffix}", 0.0) if p_suffix else row.get("EV_Away", 0.0)
                cur_prob_a = row.get(f"Prob_Away_{p_suffix}", 0.0) if p_suffix else row.get("Prob_Away", 0.0)
                cur_ev_d = row.get(f"EV_Draw_{p_suffix}", 0.0) if p_suffix else row.get("EV_Draw", 0.0)
                cur_prob_d = row.get(f"Prob_Draw_{p_suffix}", 0.0) if p_suffix else row.get("Prob_Draw", 0.0)
                
                if fh > fa:
                    confidence_int = calculate_confidence_stars(cur_ev_h, cur_prob_h, h_odds)
                elif fa > fh:
                    confidence_int = calculate_confidence_stars(cur_ev_a, cur_prob_a, a_odds)
                else:
                    d_odds = row.get("B365D", 3.0)
                    confidence_int = calculate_confidence_stars(cur_ev_d, cur_prob_d, d_odds)
                    
                star_visual = "★" * confidence_int + "☆" * (5 - confidence_int)
                base_parts.append(f"**Confidence Level:** {star_visual}")
            except Exception:
                pass
            
            return " ".join(base_parts)

        # Apply vectorization using map_elements over a struct of all needed columns
        required_cols = [home_team_col, away_team_col, "Country", "Competition"]
        
        # safely add to required columns list if present
        def add_col(c):
            if c in columns and c not in required_cols:
                required_cols.append(c)
                
        add_col(h_odds_col)
        add_col(a_odds_col)
        add_col(h_form_key)
        add_col(a_form_key)
        add_col("Most_Probable_Home_Score")
        add_col("Most_Probable_Away_Score")
        add_col("EV_Home")
        add_col("Prob_Home")
        add_col("EV_Away")
        add_col("Prob_Away")
        add_col("EV_Draw")
        add_col("Prob_Draw")
        
        if has_personalities:
            for p in personalities:
                add_col(f"{ft_h_col}_{p}")
                add_col(f"{ft_a_col}_{p}")
                add_col(f"{ht_h_col}_{p}")
                add_col(f"{ht_a_col}_{p}")
                add_col(f"{sh_h_col}_{p}")
                add_col(f"{sh_a_col}_{p}")
                add_col(f"Most_Probable_Home_Score_{p}")
                add_col(f"Most_Probable_Away_Score_{p}")
                add_col(f"EV_Home_{p}")
                add_col(f"Prob_Home_{p}")
                add_col(f"EV_Away_{p}")
                add_col(f"Prob_Away_{p}")
                add_col(f"EV_Draw_{p}")
                add_col(f"Prob_Draw_{p}")
        else:
            add_col(ft_h_col)
            add_col(ft_a_col)
            add_col(ht_h_col)
            add_col(ht_a_col)
            add_col(sh_h_col)
            add_col(sh_a_col)

        struct_col = pl.struct(required_cols)

        if has_personalities:
            for p in personalities:
                df = df.with_columns(
                    struct_col.map_elements(
                        lambda row, _p=p: process_row_for_narrative(row, _p, _p), 
                        return_dtype=pl.String
                    ).alias(f"Engine_Match_Narrative_{p}")
                )
        else:
            df = df.with_columns(
                struct_col.map_elements(
                    lambda row: process_row_for_narrative(row, "", "Engine"), 
                    return_dtype=pl.String
                ).alias("Engine_Match_Narrative")
            )

        logger.info(f"Soccer Predictor Reader generated {len(df)} intelligent scout reports.")
        
        return df
