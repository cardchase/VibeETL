import csv
import os
import sys
import glob
import concurrent.futures
import polars as pl

# Add current dir to path to import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.tools.odds_portal_scraper import OddsPortalScraperNode

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

def sync_and_deduplicate_csvs(output_dir: str):
    print("Running deduplication and synchronization on CSV files...")
    intermediate_files = glob.glob(os.path.join(output_dir, "*_intermediate.csv"))
    
    for inter_path in intermediate_files:
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
            df_merged = pl.concat(dfs, how="vertical_relaxed").unique()
            df_merged.write_csv(final_path)
            df_merged.write_csv(inter_path)
            print(f"Synced and deduplicated {slug}. Total rows: {len(df_merged)}")
        except Exception as e:
            print(f"Failed to sync {slug}: {e}")

def process_competition(url: str):
    slug = get_slug(url)
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "outputs"))
    os.makedirs(output_dir, exist_ok=True)
    
    intermediate_csv = os.path.join(output_dir, f"{slug}_intermediate.csv")
    final_csv = os.path.join(output_dir, f"{slug}.csv")
    
    # Intelligent Resume Logic
    if os.path.exists(final_csv) and not os.path.exists(intermediate_csv):
        import shutil
        shutil.copy(final_csv, intermediate_csv)
    
    # Initialize node
    node = OddsPortalScraperNode(
        node_id=f"scraper_{slug}",
        parameters={
            "targetUrl": url,
            "maxWorkers": 5,
            "headless": True,
            "scrapeAllSeasons": True,
            "autoSaveCsvPath": intermediate_csv,
            "autoSaveBatchSize": 10
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
            print(f"Finished extraction for {slug}. Saved {len(df)} rows to {final_csv}")
        else:
            print(f"Finished extraction for {slug}, but no data was returned. Logging to missed_links.")
            log_missed_link(url, "No data returned or empty DataFrame")
            
    except Exception as e:
        print(f"Error extracting {slug}: {e}. Logging to missed_links.")
        log_missed_link(url, str(e))

def main():
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "outputs"))
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Deduplicate existing CSVs first
    sync_and_deduplicate_csvs(output_dir)
    
    if len(sys.argv) > 1:
        # Run single URL passed via CLI
        urls = [sys.argv[1]]
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
                    if not url.endswith('/results/'):
                        url = url.rstrip('/') + '/results/'
                    all_urls.append(url)
                    
        print(f"Found {len(all_urls)} competitions to scrape from CSV.")
        
        # 2. Prioritize ones with intermediate files
        priority_urls = []
        regular_urls = []
        
        for url in all_urls:
            slug = get_slug(url)
            inter_path = os.path.join(output_dir, f"{slug}_intermediate.csv")
            final_path = os.path.join(output_dir, f"{slug}.csv")
            
            if os.path.exists(inter_path) or os.path.exists(final_path):
                priority_urls.append((slug, url))
            else:
                regular_urls.append((slug, url))
                
        # Sort both lists alphabetically by slug
        priority_urls.sort(key=lambda x: x[0])
        regular_urls.sort(key=lambda x: x[0])
        
        urls = [u[1] for u in priority_urls] + [u[1] for u in regular_urls]

    print(f"Preparing to scrape {len(urls)} competitions...")
    
    # Concurrent competitions using threads
    max_workers = 1 if len(urls) == 1 else 5
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(process_competition, url) for url in urls]
        try:
            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"Competition task failed: {e}")
        except KeyboardInterrupt:
            print("\n[!] Ctrl+C detected! Forcefully shutting down all scraping tasks immediately...")
            os._exit(1)

if __name__ == "__main__":
    main()
