import polars as pl
from typing import Dict, Any
from app.tools.base import BaseNode
from scipy.stats import poisson
import math
import html

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

        # Enforce Conservative baseline for EV calculations if it exists
        if "Predicted_FT_HomeScore_Conservative" in df.columns and "Predicted_FT_AwayScore_Conservative" in df.columns:
            p_home = "Predicted_FT_HomeScore_Conservative"
            p_away = "Predicted_FT_AwayScore_Conservative"
            self.log("Enforcing strict statistical calibration: Using Conservative predictions for Expected Value (EV).")
            
        # Verify columns exist
        missing = [c for c in [p_home, p_away, o_home, o_draw, o_away] if c and c not in df.columns]
        if missing:
            return self.graceful_bypass(
                df=df,
                missing_cols=missing,
                expected_config={
                    'Prob Home': p_home, 'Prob Away': p_away,
                    'Odds Home': o_home, 'Odds Draw': o_draw, 'Odds Away': o_away
                }
            )

        pd_df = df.to_pandas()
        results = []
        
        home_win_prob_list = []
        draw_prob_list = []
        away_win_prob_list = []
        ev_h_list = []
        ev_d_list = []
        ev_a_list = []

        rho = -0.13  # Standard empirical correlation parameter for professional football leagues

        for idx, row in pd_df.iterrows():
            lambda_home = row.get(p_home, 0)
            lambda_away = row.get(p_away, 0)
            
            # Handle nulls
            if math.isnan(lambda_home) or math.isnan(lambda_away):
                home_win_prob_list.append(None)
                draw_prob_list.append(None)
                away_win_prob_list.append(None)
                ev_h_list.append(None)
                ev_d_list.append(None)
                ev_a_list.append(None)
                continue
                
            home_win_prob = 0.0
            draw_prob = 0.0
            away_win_prob = 0.0

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

            # Normalize probabilities so they sum to 1 (accounting for goals > 10 missing mass)
            total = home_win_prob + draw_prob + away_win_prob
            if total > 0:
                home_win_prob /= total
                draw_prob /= total
                away_win_prob /= total

            odds_h = row.get(o_home, 0) if o_home else 0
            odds_d = row.get(o_draw, 0) if o_draw else 0
            odds_a = row.get(o_away, 0) if o_away else 0

            # Calculate EV (%)
            ev_h = ((home_win_prob * odds_h) - 1) * 100 if odds_h and not math.isnan(odds_h) else 0
            ev_d = ((draw_prob * odds_d) - 1) * 100 if odds_d and not math.isnan(odds_d) else 0
            ev_a = ((away_win_prob * odds_a) - 1) * 100 if odds_a and not math.isnan(odds_a) else 0
            
            home_win_prob_list.append(home_win_prob * 100)
            draw_prob_list.append(draw_prob * 100)
            away_win_prob_list.append(away_win_prob * 100)
            ev_h_list.append(ev_h)
            ev_d_list.append(ev_d)
            ev_a_list.append(ev_a)
            
            m_id = str(row.get(match_id, f"Row {idx}")) if match_id and match_id in row else f"Match {idx}"

            results.append({
                "Match": m_id,
                "Prob_Home": home_win_prob * 100,
                "Prob_Draw": draw_prob * 100,
                "Prob_Away": away_win_prob * 100,
                "EV_Home": ev_h,
                "EV_Draw": ev_d,
                "EV_Away": ev_a,
                "Odds_Home": odds_h,
                "Odds_Draw": odds_d,
                "Odds_Away": odds_a
            })

        # Generate HTML Dashboard
        if not results:
            self.log("No valid rows to generate report. Either missing data or no predictions available.")
            return df
            
        # Sort by best EV (max of Home, Draw, Away)
        results.sort(key=lambda x: max(x["EV_Home"], x["EV_Draw"], x["EV_Away"]), reverse=True)

        html_content = self.generate_html_report(results)
        
        pd_df['Prob_Home'] = home_win_prob_list
        pd_df['Prob_Draw'] = draw_prob_list
        pd_df['Prob_Away'] = away_win_prob_list
        pd_df['EV_Home'] = ev_h_list
        pd_df['EV_Draw'] = ev_d_list
        pd_df['EV_Away'] = ev_a_list
        
        report_df = pl.from_pandas(pd_df)
        
        # Embed the HTML payload in the first row of a special column
        payload_series = pl.Series("__vibe_html_payload__", [html_content] + [None] * (len(report_df) - 1))
        report_df = report_df.with_columns(payload_series)

        return report_df

    def generate_html_report(self, results) -> str:
        # Build rows
        rows_html = ""
        for r in results[:100]:  # Top 100 bets
            best_ev = max(r["EV_Home"], r["EV_Draw"], r["EV_Away"])
            if best_ev <= 0: continue # Only show positive EV
            
            if best_ev == r["EV_Home"]: bet_pick = "HOME WIN"
            elif best_ev == r["EV_Draw"]: bet_pick = "DRAW"
            else: bet_pick = "AWAY WIN"

            rows_html += f"""
            <tr>
                <td>{html.escape(r['Match'])}</td>
                <td><span class="highlight">{bet_pick}</span></td>
                <td style="color: {'#16a34a' if r['EV_Home'] > 0 else '#ef4444'}; font-weight: bold;">{r['EV_Home']:.2f}%</td>
                <td style="color: {'#16a34a' if r['EV_Draw'] > 0 else '#ef4444'}; font-weight: bold;">{r['EV_Draw']:.2f}%</td>
                <td style="color: {'#16a34a' if r['EV_Away'] > 0 else '#ef4444'}; font-weight: bold;">{r['EV_Away']:.2f}%</td>
                <td style="color: #64748b;">{r['Odds_Home']} | {r['Odds_Draw']} | {r['Odds_Away']}</td>
            </tr>
            """

        return f"""
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; background: #f8fafc; }}
                h1 {{ color: #0f172a; margin-bottom: 5px; font-size: 1.5rem; }}
                p.subtitle {{ color: #64748b; margin-top: 0; margin-bottom: 20px; font-size: 0.9rem; }}
                .card {{ background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #e2e8f0; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; }}
                th, td {{ padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }}
                th {{ background-color: #f1f5f9; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }}
                tr:hover {{ background-color: #f8fafc; }}
                .highlight {{ background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; }}
            </style>
        </head>
        <body>
            <h1>Betting Odds Analyzer</h1>
            <p class="subtitle">Expected Value (EV) generated from Poisson Distribution probabilities vs Bookmaker Odds</p>
            
            <div class="card">
                <h2 style="margin-top: 0; font-size: 1.2rem; color: #1e293b;">🔥 Top Value Bets (Positive EV)</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Match</th>
                            <th>Recommended Pick</th>
                            <th>EV (Home)</th>
                            <th>EV (Draw)</th>
                            <th>EV (Away)</th>
                            <th>Bookmaker Odds (1 | X | 2)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html if rows_html else "<tr><td colspan='6' style='text-align:center; padding: 20px; color: #64748b;'>No Positive EV bets found. Try predicting on a different dataset or check your odds columns.</td></tr>"}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
        """
