import asyncio
import os
import sys
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)

sys.path.append(r"d:\Project\VibeETL\backend")
from app.tools.odds_portal_upcoming import OddsPortalUpcomingNode

async def main():
    target_url = "https://backend.oddsportal.com/football/spain/laliga/"
    csv_path = r"d:\Project\VibeETL\backend\outputs\intermediates\laliga_upcoming_intermediate.csv"
    
    # Delete the corrupted intermediate CSV so the scraper is forced to farm
    # everything cleanly from scratch with the new bug fixes!
    if os.path.exists(csv_path):
        os.remove(csv_path)
        print("Deleted old corrupted CSV. Forcing clean farming pass...")

    node = OddsPortalUpcomingNode(
        node_id="laliga_farmer",
        parameters={
            "targetUrl": target_url,
            "maxWorkers": 5, # Safe concurrency limit
            "headless": True,
            "autoSaveCsvPath": csv_path,
            "scrapeAllSeasons": False
        }
    )
    
    node.log = print
    
    # 2) Scrape Match Pages (in parallel)
    print(f"Starting intelligent farming for {target_url}...")
    await node.run_crawler_pipeline(target_url)
    print("Farming complete. All gaps have been filled.")

if __name__ == "__main__":
    asyncio.run(main())
