import csv
import os
import sys
import glob
import concurrent.futures
import polars as pl
import signal

import logging
import sys
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

def force_exit_handler(sig, frame):
    print("\n[!] Ctrl+C detected! Forcefully shutting down all scraping tasks immediately...")
    os._exit(1)

signal.signal(signal.SIGINT, force_exit_handler)

# Add current dir to path to import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.tools.odds_portal_historical import OddsPortalScraperNode

def get_slug(url: str) -> str:
    parts = [p for p in url.split('/') if p]
    if not parts:
        return ""
    if parts[-1].lower() == 'results':
        competition = parts[-2].lower()
        country = parts[-3].lower()
    else:
        competition = parts[-1].lower()
        country = parts[-2].lower()
        
    country_abbr = country[:3]
    return f"{country_abbr}_{competition}"

def sync_and_deduplicate_csvs(output_dir: str, target_slug: str = None):
    intermediates_dir = os.path.join(output_dir, "intermediates")
    
    if target_slug:
        intermediate_files = [os.path.join(intermediates_dir, f"{target_slug}_intermediate.csv")]
    else:
        intermediate_files = glob.glob(os.path.join(intermediates_dir, "*_intermediate.csv"))
    
    for inter_path in intermediate_files:
        if not os.path.exists(inter_path):
            continue
            
        filename = os.path.basename(inter_path)
        slug = filename.replace("_intermediate.csv", "")
        final_path = os.path.join(output_dir, f"{slug}.csv")
        
        try:
            df_inter = pl.read_csv(inter_path, infer_schema_length=10000)
        except Exception as e:
            print(f"Failed to read {inter_path}: {e}")
            df_inter = None
            
        df_final = None
        if os.path.exists(final_path):
            try:
                df_final = pl.read_csv(final_path, infer_schema_length=10000)
            except Exception as e:
                print(f"Failed to read {final_path}: {e}")
                
        dfs = [df for df in [df_inter, df_final] if df is not None and not df.is_empty()]
        if not dfs:
            continue
            
        try:
            df_merged = pl.concat(dfs, how="vertical_relaxed")
            
            # Deduplicate based on URL. Keep the row with the LEAST nulls if duplicates exist.
            df_merged = df_merged.with_columns(
                pl.sum_horizontal(pl.all().is_null()).alias("null_count")
            ).sort("null_count").unique(subset=["URL"], keep="first").drop("null_count")
            
            # Split into fully populated (for outputs/) vs all (for intermediates/)
            critical_cols = ["FT_HomeOdds", "DNB_Home", "DC_FT_1X", "BTTS_Yes", "OU25_Over"]
            df_final_clean = df_merged
            for col in critical_cols:
                if col in df_final_clean.columns:
                    df_final_clean = df_final_clean.filter(pl.col(col).is_not_null())
                    
            df_final_clean.write_csv(final_path)
            df_merged.write_csv(inter_path)
            print(f"Synced and deduplicated {slug}. Golden rows: {len(df_final_clean)}, Incomplete rows: {len(df_merged) - len(df_final_clean)}")
        except Exception as e:
            print(f"Failed to sync {slug}: {e}")

def process_competition(url: str, tabs: int = 3, headless: bool = False):
    slug = get_slug(url)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "outputs"))
    intermediates_dir = os.path.join(output_dir, "intermediates")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(intermediates_dir, exist_ok=True)
    
    intermediate_csv = os.path.join(intermediates_dir, f"{slug}_intermediate.csv")
    final_csv = os.path.join(output_dir, f"{slug}.csv")
    
    # Intelligent Resume Logic
    if os.path.exists(final_csv) and not os.path.exists(intermediate_csv):
        import shutil
        shutil.copy(final_csv, intermediate_csv)
    
    # Sync and deduplicate this specific competition before we start
    sync_and_deduplicate_csvs(output_dir, target_slug=slug)
    
    # Initialize node
    node = OddsPortalScraperNode(
        node_id=f"scraper_{slug}",
        parameters={
            "targetUrl": url,
            "maxWorkers": tabs,
            "headless": headless,
            "scrapeAllSeasons": True,
            "autoSaveCsvPath": intermediate_csv,
            "autoSaveBatchSize": 5
        }
    )
    
    # Label the log lines clearly in the terminal
    node.workflow_name = slug
    
    missed_links_csv = os.path.join(output_dir, "missed_links.csv")
    
    def log_missed_link(failed_url, reason):
        with open(missed_links_csv, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([failed_url, reason])
            
    print(f"Starting extraction for {slug}")
    try:
        df = node.execute({"input": None})
        if df is not None and not df.is_empty():
            df.write_csv(final_csv)
            print(f"Finished extraction for {slug}. Saved {len(df)} total rows to {final_csv}")
        else:
            if os.path.exists(intermediate_csv) or os.path.exists(final_csv):
                print(f"✨ Finished {slug}. All matches were already up-to-date in your CSV (0 new matches scraped).")
            else:
                print(f"Finished extraction for {slug}, but no data was returned. Logging to missed_links.")
                log_missed_link(url, "No data returned or empty DataFrame")
            
    except Exception as e:
        print(f"Error extracting {slug}: {e}. Logging to missed_links.")
        log_missed_link(url, str(e))

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run Batch Scraping for OddsPortal")
    parser.add_argument("url", nargs="?", help="Specific URL to scrape (optional, otherwise reads from CSV)")
    parser.add_argument("-b", "--browsers", type=int, default=None, help="Number of concurrent leagues (browsers) to scrape at once.")
    parser.add_argument("-t", "--tabs", type=int, default=None, help="Number of concurrent match tabs per league.")
    parser.add_argument("--headless", action="store_true", help="Run browsers in invisible headless mode")
    
    args = parser.parse_args()

    if args.browsers is None and args.tabs is None:
        print("\n=== OddsPortal Scraper Setup ===")
        print("1. Daytime Mode   (1 Browser, 3 Tabs per browser)   - Visible browsers, lighter load")
        print("2. Nighttime Mode (10 Browsers, 3 Tabs per browser) - Headless (invisible) browsers, maximum speed")
        print("2.1 Custom Vis    (3 Browsers, 3 Tabs per browser)  - Visible browsers, balanced speed")
        print("3. Heavy Mode     (10 Browsers, 5 Tabs per browser) - Headless, aggressive speed")
        print("3.1 Heavy Vis     (10 Browsers, 5 Tabs per browser) - Visible browsers, aggressive speed")
        print("4. God Mode       (10 Browsers, 10 Tabs per browser)- Headless, extreme speed, push limits")
        print("5. Test Mode      (10 Browsers, 10 Tabs per browser)- Visible browsers, extreme speed, push limits")
        print("================================\n")
        while True:
            choice = input("Select an option (1, 2, 2.1, 3, 3.1, 4, or 5): ").strip()
            if choice == "1":
                args.browsers = 1
                args.tabs = 3
                break
            elif choice == "2":
                args.browsers = 10
                args.tabs = 3
                args.headless = True
                break
            elif choice == "2.1":
                args.browsers = 3
                args.tabs = 3
                args.headless = False
                break
            elif choice == "3":
                args.browsers = 10
                args.tabs = 5
                args.headless = True
                break
            elif choice == "3.1":
                args.browsers = 10
                args.tabs = 5
                args.headless = False
                break
            elif choice == "4":
                args.browsers = 10
                args.tabs = 10
                args.headless = True
                break
            elif choice == "5":
                args.browsers = 10
                args.tabs = 10
                args.headless = False
                break
            else:
                print("Invalid choice. Please enter 1, 2, 3, 3.1, 4, or 5.")
    else:
        # Fallbacks if they only provide one argument
        if args.browsers is None: args.browsers = 1
        if args.tabs is None: args.tabs = 3

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "outputs"))
    os.makedirs(output_dir, exist_ok=True)
    
    if args.url:
        # Run single URL passed via CLI
        urls = [args.url]
    else:
        # Batch from CSV
        csv_file = os.path.join(output_dir, "competition list.csv")
        
        all_urls = []
        if os.path.exists(csv_file):
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                next(reader, None) # skip header
                for row in reader:
                    if not row: continue
                    url = row[0]
                    
                    # Intelligently exclude e-sports, virtuals, and non-football leagues
                    url_lower = url.lower()
                    if 'football' not in url_lower:
                        continue
                    if any(exclude_term in url_lower for exclude_term in ['esoccer', 'e-soccer', 'esport', 'virtual', 'srl', 'cyber', 'simulated']):
                        continue
                        
                    if 'england/premier-league' in url_lower:
                        continue
                        
                    if not url.endswith('/results/'):
                        url = url.rstrip('/') + '/results/'
                    all_urls.append(url)
                    
        print(f"Found {len(all_urls)} competitions to scrape from CSV.")
        
        # 2. Prioritize by League Popularity First, then Status
        all_url_items = []
        
        for url in all_urls:
            slug = get_slug(url)
            intermediates_dir = os.path.join(output_dir, "intermediates")
            inter_path = os.path.join(intermediates_dir, f"{slug}_intermediate.csv")
            final_path = os.path.join(output_dir, f"{slug}.csv")
            
            # Status: 0=incomplete, 1=update, 2=new
            if os.path.exists(inter_path) and not os.path.exists(final_path):
                status = 0
            elif os.path.exists(final_path):
                status = 1
            else:
                status = 2
                
            all_url_items.append((slug, url, status))
                
        def get_priority(slug, url):
            url_lower = url.lower()
            
            # Top tier - strict marquee leagues requested by user
            top_tier = [
                'europe/champions-league', 'europe/europa-league', 'europe/conference-league',
                'england/premier-league', 'england/championship',
                'france/ligue-1', 'spain/laliga', 'germany/bundesliga', 'italy/serie-a'
            ]
            for term in top_tier:
                if term in url_lower:
                    return 1
                    
            # Mid tier - popular national leagues and second divisions
            mid_tier = ['england/championship', 'netherlands/eredivisie', 'portugal/liga-portugal', 'brazil/serie-a', 'usa/mls', 'argentina/liga-profesional', 'italy/serie-b', 'spain/laliga2', 'germany/2-bundesliga', 'france/ligue-2', 'mexico/liga-mx']
            for term in mid_tier:
                if term in url_lower:
                    return 2
                    
            # Obscure/low volume leagues - push to back
            obscure = ['women', 'femenina', 'u20', 'u23', 'u19', 'u21', 'reserve', 'regional', 'npl', 'amateur']
            for term in obscure:
                if term in url_lower:
                    return 99
                    
            return 10
            
        def sort_key(item):
            slug, url, status = item
            return (get_priority(slug, url), status, slug)

        all_url_items.sort(key=sort_key)
        urls = [item[1] for item in all_url_items]

    print(f"Preparing to scrape {len(urls)} competitions...")
    print(f"Configuration -> Browsers (Leagues): {args.browsers}, Tabs (Matches/League): {args.tabs}, Headless: {args.headless}")
    
    # Use ThreadPoolExecutor to run multiple leagues concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.browsers) as executor:
        futures = [executor.submit(process_competition, url, args.tabs, args.headless) for url in urls]
        try:
            active_futures = list(futures)
            while active_futures:
                done, not_done = concurrent.futures.wait(active_futures, timeout=0.5, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    try:
                        future.result()
                    except Exception as e:
                        print(f"Competition task failed: {e}")
                    active_futures.remove(future)
        except KeyboardInterrupt:
            print("\n[!] Ctrl+C detected! Forcefully shutting down all scraping tasks immediately...")
            os._exit(1)

if __name__ == "__main__":
    main()
