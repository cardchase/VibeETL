import os
import glob
import asyncio
import xml.etree.ElementTree as ET
import urllib.request
import gzip
from io import BytesIO
from urllib.error import HTTPError
import time

async def run_audit():
    outputs_dir = r"d:\Project\VibeETL\backend\outputs"
    print("=== OddsPortal Missing Leagues Auditor ===")
    print("This script will download the official OddsPortal sitemaps, extract every")
    print("single football league ever created, and cross-reference them against your CSVs.\n")

    # Step 1: Get what we already have
    csv_files = glob.glob(os.path.join(outputs_dir, "*.csv"))
    scraped_slugs = set()
    
    for file in csv_files:
        filename = os.path.basename(file).replace('.csv', '')
        # filename is like 'eng_premier-league'
        if '_' in filename:
            country, league = filename.split('_', 1)
            # URL format is typically /football/england/premier-league/
            # We will just store the league slug to be safe
            scraped_slugs.add(league.lower())

    print(f"[*] Found {len(csv_files)} scraped CSV files.")
    print("[*] Fetching OddsPortal Sitemap Index...")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    }

    sitemap_index_url = 'https://www.oddsportal.com/sitemap.xml'
    
    req = urllib.request.Request(sitemap_index_url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            sitemap_content = response.read()
    except HTTPError as e:
        if e.code in [503, 403]:
            print("\n[!] Cloudflare blocked the automated download.")
            print("To proceed, please open this link in your browser:")
            print("    https://www.oddsportal.com/sitemap.xml")
            print("Save the page (Ctrl+S) as 'sitemap.xml' in this backend directory.")
            input("Press Enter when you have saved the file...")
            try:
                with open("sitemap.xml", "rb") as f:
                    sitemap_content = f.read()
            except FileNotFoundError:
                print("Could not find sitemap.xml. Exiting.")
                return
        else:
            print(f"Failed to fetch sitemap: {e}")
            return

    # Parse the index
    print("[*] Parsing sitemap index...")
    root = ET.fromstring(sitemap_content)
    
    # Extract child sitemap URLs
    sitemap_urls = []
    for sitemap in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}sitemap"):
        loc = sitemap.find("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        if loc is not None and "tournament" in loc.text:  # We only care about tournaments
            sitemap_urls.append(loc.text)

    if not sitemap_urls:
        print("[!] Could not find any tournament sitemaps in the index.")
        print("Assuming you downloaded 'sitemap-tournaments.xml' directly.")
        sitemap_urls = [] # Add fallback logic here if needed

    print(f"[*] Found {len(sitemap_urls)} tournament sitemaps. Downloading and analyzing...")
    
    all_tournaments = set()
    
    for url in sitemap_urls:
        print(f"    -> Downloading {url}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                if url.endswith('.gz'):
                    content = gzip.decompress(response.read())
                else:
                    content = response.read()
                    
            gz_root = ET.fromstring(content)
            for url_tag in gz_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url"):
                loc = url_tag.find("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
                if loc is not None and "/football/" in loc.text:
                    # typical format: https://www.oddsportal.com/football/australia/a-league/
                    parts = [p for p in loc.text.split('/') if p]
                    if len(parts) >= 5: # ['https:', 'www.oddsportal.com', 'football', 'australia', 'a-league']
                        league_slug = parts[4]
                        all_tournaments.add(loc.text)
        except Exception as e:
            print(f"    [!] Failed to process {url}: {e}")
        time.sleep(1) # Be polite to the server

    print(f"\n[*] Extracted {len(all_tournaments)} total football leagues from the sitemap.")

    # Diff
    missing = []
    for t_url in all_tournaments:
        parts = [p for p in t_url.split('/') if p]
        league_slug = parts[4].lower()
        if league_slug not in scraped_slugs:
            missing.append(t_url)

    print(f"[*] Found {len(missing)} missing leagues!")
    
    if missing:
        out_file = "missing_leagues_audit.txt"
        with open(out_file, "w") as f:
            for m in sorted(missing):
                f.write(f"{m}\n")
        print(f"[*] Saved the complete list of missing leagues to: {out_file}")
        print("You can feed these exact URLs into your scraper to get 100% coverage.")
    else:
        print("[*] You have 100% coverage! No missing leagues found.")

if __name__ == "__main__":
    asyncio.run(run_audit())
