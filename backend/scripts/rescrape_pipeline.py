import asyncio
import os
import glob
import polars as pl
from typing import List, Dict, Any
import sys

# Ensure the app module can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.tools.odds_portal_historical import OddsPortalScraperNode

import math

def is_corrupted(row: dict) -> bool:
    """Identify if a row is missing odds (NaN/Null/Empty) in standard markets."""
    check_cols = [
        "DNB_Home", "DNB_Away",
        "DC_FT_1X", "DC_FT_12", "DC_FT_X2",
        "DC_1H_1X", "DC_1H_12", "DC_1H_X2",
        "DC_2H_1X", "DC_2H_12", "DC_2H_X2",
        "BTTS_Yes", "BTTS_No",
        "BTTS_1H_Yes", "BTTS_1H_No",
        "BTTS_2H_Yes", "BTTS_2H_No",
        "1H_HomeOdds", "1H_AwayOdds"
    ]
    
    for col in check_cols:
        val = row.get(col)
        if val is None or val == "":
            return True
        if isinstance(val, float) and math.isnan(val):
            return True
            
    return False

async def rescrape_matches():
    outputs_dir = r"d:\Project\VibeETL\backend\outputs"
    if not os.path.exists(outputs_dir):
        print(f"Directory not found: {outputs_dir}")
        return

    csv_files = glob.glob(os.path.join(outputs_dir, "*.csv"))
    
    # Prioritize marquee leagues
    marquee_leagues = ['premier-league', 'laliga', 'serie-a', 'bundesliga', 'ligue-1', 'champions-league', 'europa-league']
    def sort_key(filepath):
        basename = os.path.basename(filepath).lower()
        is_marquee = any(m in basename for m in marquee_leagues)
        return (0 if is_marquee else 1, basename)
        
    csv_files.sort(key=sort_key)
    print(f"Found {len(csv_files)} CSV files in {outputs_dir} (Marquee leagues prioritized)")

    scraper = OddsPortalScraperNode(node_id="rescrape", parameters={"headless": True, "maxWorkers": 15})
    scraper.log = print # Override log to print to console
    
    total_rescraped = 0
    total_fixed = 0

    import random

    for file_path in csv_files:
        print(f"Processing: {os.path.basename(file_path)}")
        df = pl.read_csv(file_path)
        
        if "URL" not in df.columns:
            continue
            
        rows = df.to_dicts()
        corrupted_indices = [i for i, row in enumerate(rows) if is_corrupted(row)]
        
        if not corrupted_indices:
            print("  No corrupted rows found.")
            continue
            
        print(f"  Found {len(corrupted_indices)} corrupted rows. Rescraping concurrently...")
        
        updated_rows = rows.copy()
        
        # Concurrency limit reduced to prevent 404 Anti-bot bans
        semaphore = asyncio.Semaphore(15)
        
        async def process_url(idx, row_data):
            url = row_data["URL"]
            
            # STAGGERING: Prevent all workers from hitting the server at the exact same millisecond
            await asyncio.sleep(random.uniform(0.5, 5.0))
            
            async with semaphore:
                print(f"    Rescraping URL: {url}")
                try:
                    # STRICT TIMEOUT: Prevent Playwright from deadlocking forever
                    res = await asyncio.wait_for(scraper.run_crawler_pipeline(url), timeout=60.0)
                    if res and len(res) > 0:
                        new_row = res[0]
                        
                        # VALIDATION: Ensure the newly scraped row isn't STILL corrupted!
                        if is_corrupted(new_row):
                            print(f"    [!] Scraped data for {url} is still corrupted. Discarding.")
                            return (idx, row_data, False)

                        # Check if scraper failed to grab ANY odds (OddsPortal blocked us)
                        odds_cols = [k for k in new_row.keys() if "Odds" in k or "BTTS" in k or "DC" in k or "DNB" in k]
                        if all(new_row.get(k) is None for k in odds_cols):
                            print(f"    [!] Scraper returned completely blank odds for {url} (Likely IP blocked). Discarding to protect data.")
                            return (idx, row_data, False)

                        # Make sure not to overwrite URL if it's correct, but update the rest
                        for k, v in new_row.items():
                            if k in row_data and not str(k).startswith("_"):
                                # Only overwrite meta columns if they are not empty
                                if k in ["Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam"] and (v is None or v == ""):
                                    continue
                                # SAFETY: Do not overwrite valid existing data with None!
                                if v is None and row_data.get(k) not in [None, "", 0.5, 1.5, 2.5]:
                                    continue
                                row_data[k] = v
                        return (idx, row_data, True)
                except asyncio.TimeoutError:
                    print(f"    [!] Timeout deadlocked rescraping {url}")
                except Exception as e:
                    print(f"    Error rescraping {url}: {e}")
                return (idx, row_data, False)

        tasks = [process_url(idx, rows[idx]) for idx in corrupted_indices]
        results = await asyncio.gather(*tasks)
        
        for idx, updated_row_data, success in results:
            if success:
                updated_rows[idx] = updated_row_data
                total_fixed += 1
            total_rescraped += 1
                
        # Save back to CSV
        schema = {h: pl.Utf8 if h in ["Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam", "Match_Status", "URL", "Match_Winner_Final", "Is_Knockout", "Went_To_ET"] else pl.Float64 for h in df.columns if h in df.columns}
        
        # In case the columns match exactly, just overwrite
        updated_df = pl.DataFrame(updated_rows, infer_schema_length=10000)
        # Apply original schema types for consistency
        for col, dtype in zip(df.columns, df.dtypes):
            if col in updated_df.columns:
                updated_df = updated_df.with_columns(pl.col(col).cast(dtype))
                
        updated_df.write_csv(file_path)
        print(f"  Saved corrected data to {os.path.basename(file_path)}")
        
    print(f"\nRescrape Complete. Processed {total_rescraped} matches, successfully fixed {total_fixed}.")

if __name__ == "__main__":
    asyncio.run(rescrape_matches())
