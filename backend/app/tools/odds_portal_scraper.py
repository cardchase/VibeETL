"""
OddsPortal Scraper Module
=========================

An enterprise-grade, high-concurrency web scraper utilizing Playwright and Stealth modules 
to interact with and extract historical betting odds from OddsPortal.

Core features:
- Deep React-DOM synchronization for race-condition prevention under CPU load.
- Smart fallbacks and polling loops for UI hydration.
- Exact-match decimal, American, and fractional odds parsing pipelines.
- Headless Chromium orchestration with dynamic cancellation listeners.
"""
import asyncio
import re
from typing import Dict, Any, List
import polars as pl
from tabulate import tabulate
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from app.tools.base import BaseNode
from app.cache import cache_manager

def format_df_log(df: pl.DataFrame, max_rows: int = 5) -> str:
    if df is None or df.height == 0:
        return "(0 rows captured)"
    key_cols = ["Date", "Time", "Country", "Competition", "HomeTeam", "AwayTeam", "Match_Status", "FT_HomeScore", "FT_AwayScore", "FT_HomeOdds", "FT_DrawOdds", "FT_AwayOdds"]
    present_cols = [c for c in key_cols if c in df.columns]
    if not present_cols:
        present_cols = df.columns[:10]
    
    slice_df = df.select(present_cols).head(max_rows)
    preview_rows = slice_df.to_dicts()
    if not preview_rows:
        return "(0 rows)"
    headers = list(preview_rows[0].keys())
    table_data = [[r.get(h) for h in headers] for r in preview_rows]
    table_str = tabulate(table_data, headers=headers, tablefmt="grid")
    if df.height > max_rows:
        table_str += f"\n... ({df.height - max_rows} more rows)"
    return table_str

HEADERS = [
    # Core Identifiers & Tournament State
    "Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam", "Match_Status", "URL",
    "Is_Knockout", "Went_To_ET", "Match_Winner_Final",

    # Granular Score Progression Timeline
    "FT_HomeScore", "FT_AwayScore",           # Official score at 90' + stoppage
    "HT_HomeScore", "HT_AwayScore",           # Score at 1st Half whistle
    "SH_HomeScore", "SH_AwayScore",           # Isolated 2nd Half goals (FT minus HT)
    "ET_HomeScore", "ET_AwayScore",           # Goals scored strictly during Extra Time
    "Penalties_HomeScore", "Penalties_AwayScore", # Shootout goals converted
    
    # 1X2 Outcome Lines (Bet365 Only)
    "FT_HomeOdds", "FT_DrawOdds", "FT_AwayOdds",
    "1H_HomeOdds", "1H_DrawOdds", "1H_AwayOdds",
    "SH_HomeOdds", "SH_DrawOdds", "SH_AwayOdds",  
    
    # Total Goals Over/Under Split Matrix (Bet365 Only)
    "OU05_Over", "OU05_Under", "OU15_Over", "OU15_Under", 
    "OU25_Over", "OU25_Under", "OU35_Over", "OU35_Under", 
    "OU45_Over", "OU45_Under", "OU55_Over", "OU55_Under",
    
    # Both Teams to Score (BTTS Splits - Bet365 Only)
    "BTTS_Yes", "BTTS_No", 
    "BTTS_1H_Yes", "BTTS_1H_No", 
    "BTTS_2H_Yes", "BTTS_2H_No",
    
    # Draw No Bet Splits (Bet365 Only)
    "DNB_Home", "DNB_Away", 
    
    # Double Chance Splits (Bet365 Only)
    "DC_FT_1X", "DC_FT_12", "DC_FT_X2",   
    "DC_1H_1X", "DC_1H_12", "DC_1H_X2",   
    "DC_2H_1X", "DC_2H_12", "DC_2H_X2"    
]

class OddsPortalScraperNode(BaseNode):
    """
    ETL Node for harvesting odds data from OddsPortal.
    
    This node intercepts the requested URL (either a single match page or a league/tournament 
    overview page), orchestrates headless Chromium instances, and systematically extracts 
    match status, scores, and various betting market lines.
    """
    MANIFEST = {
        "id": "odds_portal_scraper",
        "name": "OddsPortal Scraper",
        "category": "source",
        "icon": "Database",
        "description": "High-fidelity odds harvesting from active React DOM states."
    }

    def execute(self, inputs: Dict[str, Any]) -> pl.DataFrame:
        """
        Main execution entrypoint for the ETL pipeline.
        Validates inputs, initializes the asynchronous scraping pipeline, and wraps
        the result in a strongly-typed Polars DataFrame.
        """
        target_url = self.parameters.get("targetUrl")
        if not target_url:
            raise ValueError("Target URL is required.")
        
        # Sanitize accidental spaces from copy-paste
        target_url = target_url.strip().replace(" ", "-")
            
        result_rows = asyncio.run(self.run_crawler_pipeline(target_url))
        schema = {h: pl.Utf8 if h in ["Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam", "Match_Status", "URL", "Match_Winner_Final", "Is_Knockout", "Went_To_ET"] else pl.Float64 for h in HEADERS}
        return pl.DataFrame(result_rows, schema=schema) if result_rows else pl.DataFrame([], schema=schema)

    async def run_crawler_pipeline(self, url: str) -> List[Dict[str, Any]]:
        """
        Orchestrates the entire scraping lifecycle.
        
        - Instantiates Playwright and Chromium.
        - Applies stealth plugin to evade bot detection.
        - If the URL is a specific match, scrapes it directly.
        - If the URL is a competition/league, it paginates through the list of matches
          and uses an asyncio Semaphore to extract data concurrently (e.g. 10 tabs at once).
        """
        # Instantly clear any old cached results in the UI
        sid = getattr(self, "session_id", "default")
        schema = {h: pl.Utf8 if h in ["Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam", "Match_Status", "URL", "Match_Winner_Final", "Is_Knockout", "Went_To_ET"] else pl.Float64 for h in HEADERS}
        empty_df = pl.DataFrame([], schema=schema)
        from app.cache import cache_manager
        cache_manager.get_cache(sid).set_node_partial_result(self.node_id, empty_df, self.logs)

        is_match = "/h2h/" in url or re.search(r'-[a-zA-Z0-9]{8}/(?:#.*)?$', url)
        
        async with async_playwright() as p:
            # We use an authentic user agent to avoid trivial bot blocking
            browser = await p.chromium.launch(
                headless=False,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            async def global_cancel_watcher():
                while True:
                    if hasattr(self, "is_cancelled") and self.is_cancelled():
                        self.log("GLOBAL WATCHER: Cancellation detected! Force closing browser to immediately halt all tasks...")
                        try:
                            await browser.close()
                        except:
                            pass
                        break
                    await asyncio.sleep(0.5)
            
            global_watcher_task = asyncio.create_task(global_cancel_watcher())
            
            try:
                if is_match:
                    page = await context.new_page()
                    await Stealth().apply_stealth_async(page)
                    row = await self.execute_interception_engine(page, url)
                    return [row] if row else []
                else:
                    scrape_all_seasons = self.parameters.get("scrapeAllSeasons", False)
                    auto_save_csv = self.parameters.get("autoSaveCsvPath", None)
                    auto_save_batch_size = int(self.parameters.get("autoSaveBatchSize", 10))
                    schema = {h: pl.Utf8 if h in ["Date", "Time", "Country", "Competition", "Season", "HomeTeam", "AwayTeam", "Match_Status", "URL", "Match_Winner_Final", "Is_Knockout", "Went_To_ET"] else pl.Float64 for h in HEADERS}
                    
                    competition_page = await context.new_page()
                    await Stealth().apply_stealth_async(competition_page)
                    
                    if scrape_all_seasons:
                        # Intelligence check: If the user provided a specific season year in the URL, don't crawl upwards.
                        if re.search(r'-\d{4}-\d{4}/results/?$', url) or re.search(r'-\d{4}/results/?$', url):
                            self.log("Detected a specific season in the target URL. Bypassing 'scrapeAllSeasons' to stay at the lowest level.")
                            season_urls = [url]
                        else:
                            season_urls = await self.extract_season_links(competition_page, url)
                    else:
                        season_urls = [url]
                        
                    all_valid_rows = []
                    csv_buffer = []
                    
                    for s_idx, season_url in enumerate(season_urls):
                        if hasattr(self, "is_cancelled") and self.is_cancelled():
                            break
                            
                        self.log(f"--- Processing Season {s_idx+1}/{len(season_urls)}: {season_url} ---")
                        match_links = await self.extract_match_links(competition_page, season_url)
                        
                        max_workers = int(self.parameters.get("maxWorkers", 1))
                        self.log(f"Found {len(match_links)} matches. Starting concurrent extraction ({max_workers} at a time)...")
                        semaphore = asyncio.Semaphore(max_workers)
                        
                        async def process_match(match_url):
                            if hasattr(self, "is_cancelled") and self.is_cancelled():
                                return None
                            async with semaphore:
                                if hasattr(self, "is_cancelled") and self.is_cancelled():
                                    return None
                                page = None
                                try:
                                    page = await context.new_page()
                                    await Stealth().apply_stealth_async(page)
                                    return await self.execute_interception_engine(page, match_url)
                                except Exception as e:
                                    if hasattr(self, "is_cancelled") and self.is_cancelled():
                                        return None
                                    raise
                                finally:
                                    if page:
                                        try:
                                            await asyncio.sleep(0.5) # Allow visual transition
                                            await page.close()
                                            await asyncio.sleep(0.5) # Wait before next page
                                        except:
                                            pass
                                            
                        tasks = [asyncio.create_task(process_match(link)) for link in match_links]
                        
                        for completed_task in asyncio.as_completed(tasks):
                            if hasattr(self, "is_cancelled") and self.is_cancelled():
                                self.log("Cancellation detected, aborting extraction loop.")
                                for t in tasks:
                                    t.cancel()
                                break
                            try:
                                r = await completed_task
                                if isinstance(r, dict):
                                    all_valid_rows.append(r)
                                    
                                    # Send sequential update to cache manager so UI data tab updates in real-time
                                    partial_df = pl.DataFrame(all_valid_rows, schema=schema) if all_valid_rows else pl.DataFrame()
                                    sid = getattr(self, "session_id", "default")
                                    
                                    status_str = r.get("Match_Status", "N/A")
                                    ft_score = f"{r.get('FT_HomeScore')}-{r.get('FT_AwayScore')}" if r.get('FT_HomeScore') is not None else "N/A"
                                    match_title = f"{r.get('HomeTeam', 'Unknown')} vs {r.get('AwayTeam', 'Unknown')}"
                                    self.log(f"Extracted Match [{len(all_valid_rows)}]: {match_title} | URL: {r.get('URL', 'Unknown')} | Status: {status_str} | Score: {ft_score}")
                                    
                                    cache_manager.get_cache(sid).set_node_partial_result(
                                        self.node_id, partial_df, self.logs
                                    )
                                    
                                    # Auto-save CSV logic
                                    if auto_save_csv:
                                        csv_buffer.append(r)
                                        if len(csv_buffer) >= auto_save_batch_size:
                                            try:
                                                import os
                                                df_batch = pl.DataFrame(csv_buffer, schema=schema)
                                                if os.path.exists(auto_save_csv):
                                                    with open(auto_save_csv, mode='ab') as f:
                                                        df_batch.write_csv(f, include_header=False)
                                                else:
                                                    df_batch.write_csv(auto_save_csv)
                                                self.log(f"Auto-saved batch of {len(csv_buffer)} rows to CSV.")
                                                csv_buffer.clear()
                                            except Exception as e:
                                                self.log(f"Error auto-saving to CSV: {e}")
                            except Exception as e:
                                if not (hasattr(self, "is_cancelled") and self.is_cancelled()):
                                    self.log(f"Error extracting match: {e}")
                                    if "closed" in str(e).lower():
                                        raise e
                                    
                    # Final flush of the remaining buffered rows if any
                    if auto_save_csv and csv_buffer:
                        try:
                            import os
                            df_batch = pl.DataFrame(csv_buffer, schema=schema)
                            if os.path.exists(auto_save_csv):
                                with open(auto_save_csv, mode='ab') as f:
                                    df_batch.write_csv(f, include_header=False)
                            else:
                                df_batch.write_csv(auto_save_csv)
                            self.log(f"Auto-saved final batch of {len(csv_buffer)} rows to CSV.")
                            csv_buffer.clear()
                        except Exception as e:
                            self.log(f"Error auto-saving final batch to CSV: {e}")
                                    
                    await competition_page.close()
                    return all_valid_rows
            except Exception as e:
                if hasattr(self, "is_cancelled") and self.is_cancelled():
                    self.log("Pipeline execution aborted gracefully due to cancellation signal.")
                    try:
                        return all_valid_rows
                    except:
                        return []
                raise
            finally:
                global_watcher_task.cancel()
                await browser.close()

    async def extract_season_links(self, page, base_url: str) -> List[str]:
        try:
            self.log(f"Navigating to base URL to discover historical seasons: {base_url}")
            await page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
            # The seasons are inside a flex-wrap container with a link to results/
            # We will grab all hrefs that match the pattern /football/<country>/<league>
            # The user provided outerHTML: <div class="flex flex-wrap gap-2 py-3 ..."><a href="...">...</a></div>
            await page.wait_for_selector('a[href*="/results/"]', timeout=15000)
            
            links = await page.evaluate(r"""
                () => {
                    let containers = Array.from(document.querySelectorAll('div.flex.flex-wrap.gap-2.py-3'));
                    for (let c of containers) {
                        let aTags = Array.from(c.querySelectorAll('a[href*="/results/"]'));
                        if (aTags.length > 3) {
                            return aTags.map(a => a.href);
                        }
                    }
                    return [];
                }
            """)
            
            if links:
                # Remove duplicates while preserving order
                unique_links = []
                for l in links:
                    if l not in unique_links:
                        unique_links.append(l)
                self.log(f"Found {len(unique_links)} historical seasons.")
                return unique_links
            else:
                self.log("Could not find the season pagination container. Falling back to single season.")
                return [base_url]
        except Exception as e:
            self.log(f"Error extracting season links: {e}")
            return [base_url]


    async def extract_match_links(self, page, competition_url: str) -> List[str]:
        max_retries = 3
        match_links = []
        seen_links = set()

        for attempt in range(max_retries):
            if hasattr(self, "is_cancelled") and self.is_cancelled():
                return []
            try:
                if attempt == 0:
                    response = await page.goto(competition_url, wait_until="domcontentloaded", timeout=30000)
                else:
                    self.log(f"Attempt {attempt + 1}: Refreshing page to find match links...")
                    response = await page.reload(wait_until="domcontentloaded", timeout=30000)
                    
                if response and not response.ok:
                    self.log(f"Warning: OddsPortal returned HTTP {response.status}. The URL may be invalid.")
            except Exception as e:
                self.log(f"Error navigating to competition URL on attempt {attempt + 1}: {e}")
                if "closed" in str(e).lower():
                    raise e
                continue
            
            # Wait for the match grid to render
            try:
                # Fast fail if the page clearly says there are no matches
                no_matches = await page.evaluate("() => document.body.innerText.includes('Unfortunately, no matches can be displayed')")
                if no_matches:
                    self.log("Detected 'no matches' message. This season has no data yet. Skipping...")
                    return []
                
                await page.wait_for_selector('a[href*="/h2h/"]', state="attached", timeout=15000)
            except Exception as e:
                self.log(f"Warning: Timed out waiting for match links on {competition_url} (Attempt {attempt + 1})")

            # Pagination Loop
            max_pages = 50
            for page_num in range(1, max_pages + 1):
                if hasattr(self, "is_cancelled") and self.is_cancelled():
                    self.log("Cancellation detected, stopping pagination.")
                    break
                self.log(f"Scanning page {page_num} for matches...")
                
                # Scroll to load lazy-loaded matches
                for _ in range(5):
                    await page.evaluate("window.scrollBy(0, window.innerHeight)")
                    await page.wait_for_timeout(1000)
                
                # Scope to the main column to avoid sidebar (popular matches) pollution
                links = await page.evaluate("""() => {
                    let mainColumn = document.querySelector('div.flex.flex-col') || document.body;
                    return Array.from(mainColumn.querySelectorAll('a')).map(a => a.href);
                }""")
                
                # Filter for match links
                new_links_count = 0
                
                for l in links:
                    if l == competition_url or "outrights" in l or "results" in l or "standings" in l:
                        continue
                    
                    # Ensure the match link matches the ID pattern (8 alphanumeric chars hash)
                    if re.search(r'-[a-zA-Z0-9]{8}/?(?:[?#].*)?$', l):
                        if l not in seen_links:
                            seen_links.add(l)
                            match_links.append(l)
                            new_links_count += 1
                            
                self.log(f"Found {new_links_count} new match links on page {page_num}. Total unique matches so far: {len(seen_links)}")
                
                # Try clicking "Next" button
                next_clicked = await page.evaluate("""
                    () => {
                        let nextBtns = Array.from(document.querySelectorAll('a')).filter(a => a.innerText && a.innerText.trim() === 'Next');
                        if (nextBtns.length > 0) {
                            nextBtns[0].click();
                            return true;
                        }
                        return false;
                    }
                """)
                
                if next_clicked:
                    self.log(f"Found 'Next' page. Loading...")
                    await page.wait_for_timeout(4000)
                else:
                    self.log(f"No 'Next' button found. Reached the last page.")
                    break
                    
            if match_links:
                self.log(f"Successfully finished scraping competition. Total match links found: {len(match_links)}")
                # Process latest matches first per user request
                break
            else:
                self.log(f"No match links found on attempt {attempt + 1}.")
                # Wait a bit before refreshing
                await page.wait_for_timeout(2000)
                
        return match_links

    async def execute_interception_engine(self, page, url: str) -> Dict[str, Any]:
        """
        The core harvesting engine for an individual match page.
        
        This method uses a multi-phase approach:
        1. Navigates to the match URL and waits for the foundational DOM to render.
        2. Injects JS to extract metadata (teams, scores, match state) from the UI and LD+JSON script tags.
        3. Defines JS functions to explicitly verify the active state of React tabs to prevent race conditions.
        4. Navigates through betting markets (Full Time, 1st Half, Over/Under, etc.) while
           strictly waiting for React DOM updates before extracting odds.
        5. Parses exact-match betting odds using tailored Regex and handles UI fallback structures.
        """
        
        async def cancel_watcher():
            while True:
                if hasattr(self, "is_cancelled") and self.is_cancelled():
                    try:
                        await page.close()
                    except:
                        pass
                    break
                await asyncio.sleep(0.5)
                
        watcher_task = asyncio.create_task(cancel_watcher())
        
        extracted_row = {h: None for h in HEADERS}
        extracted_row["URL"] = url
        
        # --- PHASE 1: HYDRATE COMPONENT ROUTER STATE ---
        try:
            component_id = await page.evaluate(r"""
                () => {
                    if (window.location.hash) {
                        let hashMatch = window.location.hash.match(/#([a-zA-Z0-9]{8}):/);
                        if (hashMatch) return hashMatch[1];
                    }
                    if (window.__NUXT__?.data) {
                        let keys = Object.keys(window.__NUXT__.data);
                        for (let k of keys) {
                            if (k.length === 8 && !k.includes('-')) return k;
                        }
                        return keys[0] || "dynamic";
                    }
                    let match = document.body.innerHTML.match(/"id"\s*:\s*"([a-zA-Z0-9]{8})"/);
                    return match ? match[1] : "dynamic";
                }
            """)
        except:
            component_id = "dynamic"
            
        if component_id == "dynamic" or len(component_id) != 8:
            hash_match = re.search(r'#([a-zA-Z0-9]{8}):', url)
            if hash_match:
                component_id = hash_match.group(1)
            else:
                match_id_search = re.search(r'-([a-zA-Z0-9]{8})/?(?:#|$)', url)
                component_id = match_id_search.group(1) if match_id_search else "Iiqjm5Pq"

        # --- PHASE 1B: PAGE LOAD WITH RETRY LOOP ---
        for attempt in range(3):
            if hasattr(self, "is_cancelled") and self.is_cancelled():
                return extracted_row
            try:
                if attempt == 0:
                    response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                else:
                    self.log(f"Attempt {attempt + 1}: Refreshing match page due to missing DOM tags...")
                    response = await page.reload(wait_until="domcontentloaded", timeout=30000)
                
                if response and not response.ok:
                    if attempt == 2: return extracted_row
                    continue
                    
                # Wait for SPA DOM hydration of match items
                await page.wait_for_selector('[data-testid="game-time-item"], [data-testid="live-info"], a[href*="1X2"], .flex-col', state="attached", timeout=15000)
                
                # Give the DOM an extra moment to settle text nodes
                await page.wait_for_timeout(2500)
                break
            except Exception as e:
                if attempt == 2:
                    self.log(f"Failed to load match page after 3 attempts: {e}")
                    return extracted_row
        
        for selector in ['button:has-text("I Accept")', '#onetrust-accept-btn-handler', '.accept-choices']:
            try:
                await page.click(selector, timeout=1000)
            except:
                pass
                
        # Give the DOM an extra moment to settle text nodes
        await page.wait_for_timeout(2500)

        # --- PHASE 2: SCORE TIMELINE TOKENS PROCESSING ---
        score_data = await page.evaluate(r"""
        () => {
            let res = {
                HomeTeam: '', AwayTeam: '', Country: '', Competition: '', Season: '', Date: '', Time: '', Match_Status: 'Upcoming',
                FT_HomeScore: null, FT_AwayScore: null, HT_HomeScore: null, HT_AwayScore: null,
                SH_HomeScore: null, SH_AwayScore: null, ET_HomeScore: null, ET_AwayScore: null,
                Penalties_HomeScore: null, Penalties_AwayScore: null, Went_To_ET: "No", Is_Knockout: "No", Match_Winner_Final: null
            };

            let cleanText = (str) => {
                if (!str) return '';
                return str.replace(/[\u00a0\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
            };

            // 1. Extract Date & Time directly from data-testid="game-time-item"
            let timeItem = document.querySelector('[data-testid="game-time-item"]');
            if (timeItem) {
                let pTags = Array.from(timeItem.querySelectorAll('p')).map(p => cleanText(p.innerText));
                for (let p of pTags) {
                    let dateMatch = p.match(/\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/);
                    if (dateMatch) res.Date = dateMatch[1];
                    let timeMatch = p.match(/\b(\d{2}:\d{2})\b/);
                    if (timeMatch) res.Time = timeMatch[1];
                }
            }

            // 2. Extract Teams from H1
            let h1 = document.querySelector('h1');
            if (h1) {
                let h1Text = cleanText(h1.innerText);
                if (h1Text.includes(' - ')) {
                    let parts = h1Text.split(' - ');
                    if (!res.HomeTeam) res.HomeTeam = parts[0].trim();
                    if (!res.AwayTeam) res.AwayTeam = parts[1].replace(/\s*(Odds|Scores|H2H).*$/i, '').trim();
                }
            }

            // 3. Extract Live Info & Score from data-testid="live-info" or body
            let liveInfo = document.querySelector('[data-testid="live-info"]') || document.querySelector('.live-info');
            let liveText = liveInfo ? cleanText(liveInfo.innerText) : '';
            let mainContent = document.querySelector('.flex.flex-col.w-full.min-w-0') || document.body;
            let bodyText = cleanText(mainContent.innerText);

            let fullText = (liveText + ' ' + bodyText).trim();

            // Determine status
            if (fullText.match(/\b(Half Time|HT|\d{1,3}'\b)/i) || fullText.match(/(Score\s*live|Live\s*Score)/i)) {
                res.Match_Status = "Live";
            } else if (fullText.match(/postponed/i)) {
                res.Match_Status = "Postponed";
            } else if (fullText.match(/canceled|cancelled/i)) {
                res.Match_Status = "Cancelled";
            } else if (fullText.match(/\b(Final\s*result|Full\s*Time|Finished|FT|After\s*Penalties|After\s*ET|After\s*OT)\b/i) || liveText.match(/\b\d+\s*[:-]\s*\d+\b/)) {
                res.Match_Status = "Finished";
            }

            // Extract score string
            let mainMatch = null;
            if (liveText) {
                mainMatch = liveText.match(/(?:Final\s*result|Score\s*live|Live\s*Score|Full\s*Time|After\s*Penalties|After\s*ET)?\s*(\d+)\s*[:-]\s*(\d+)(?:\s*\(([^)]+)\))?/i);
            }
            if (!mainMatch || !mainMatch[1]) {
                mainMatch = bodyText.match(/(?:Final\s*result|Score\s*live|Live\s*Score|Full\s*Time)\s*(\d+)\s*[:-]\s*(\d+)(?:\s*\(([^)]+)\))?/i);
            }

            if (mainMatch && mainMatch[1] !== undefined && mainMatch[2] !== undefined) {
                let pHome = parseFloat(mainMatch[1]);
                let pAway = parseFloat(mainMatch[2]);
                let splitText = mainMatch[3] || "";

                let parseScore = (seg) => {
                    if (!seg) return [null, null];
                    let p = seg.split(':');
                    if (p.length >= 2) return [parseFloat(p[0].replace(/[^\d.-]/g, '')), parseFloat(p[1].replace(/[^\d.-]/g, ''))];
                    return [null, null];
                };

                if (fullText.match(/penalties/i) || splitText.match(/pen/i)) {
                    res.Penalties_HomeScore = pHome;
                    res.Penalties_AwayScore = pAway;
                    res.Went_To_ET = "Yes";
                    res.Is_Knockout = "Yes";
                    if (splitText) {
                        let segments = splitText.split(',').map(s => cleanText(s));
                        let s0 = parseScore(segments[0]);
                        if (s0[0] !== null) { res.FT_HomeScore = s0[0]; res.FT_AwayScore = s0[1]; }
                        let s1 = parseScore(segments[1]);
                        if (s1[0] !== null) { res.HT_HomeScore = s1[0]; res.HT_AwayScore = s1[1]; }
                        let s2 = parseScore(segments[2]);
                        if (s2[0] !== null) { res.SH_HomeScore = s2[0]; res.SH_AwayScore = s2[1]; }
                        let s3 = parseScore(segments[3]);
                        if (s3[0] !== null) { res.ET_HomeScore = s3[0]; res.ET_AwayScore = s3[1]; }
                    }
                } else {
                    res.FT_HomeScore = pHome;
                    res.FT_AwayScore = pAway;
                    if (splitText) {
                        let segments = splitText.split(',').map(s => cleanText(s));
                        let s0 = parseScore(segments[0]);
                        if (s0[0] !== null) { res.HT_HomeScore = s0[0]; res.HT_AwayScore = s0[1]; }
                        let s1 = parseScore(segments[1]);
                        if (s1[0] !== null) { res.SH_HomeScore = s1[0]; res.SH_AwayScore = s1[1]; }
                        if (segments.length > 2 && segments[2]) {
                            let s2 = parseScore(segments[2]);
                            if (s2[0] !== null) {
                                res.ET_HomeScore = s2[0];
                                res.ET_AwayScore = s2[1];
                                res.Went_To_ET = "Yes";
                                res.Is_Knockout = "Yes";
                            }
                        }
                    }
                }
                res.Match_Status = "Finished";
            }

            document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                try {
                    let d = JSON.parse(script.textContent);
                    if (d["@type"]?.includes("Event")) {
                        res.HomeTeam = d.homeTeam?.name || res.HomeTeam;
                        res.AwayTeam = d.awayTeam?.name || res.AwayTeam;
                        if (d.startDate) {
                            let dt = new Date(d.startDate);
                            let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            res.Date = dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
                            res.Time = String(dt.getHours()).padStart(2, '0') + ":" + String(dt.getMinutes()).padStart(2, '0');
                        }
                    }
                    if (d["@type"] === "BreadcrumbList" && d.itemListElement?.length >= 4) {
                        res.Country = d.itemListElement[2].name; 
                        let compStr = d.itemListElement[3].name;
                        let seasonMatch = compStr.match(/\d{4}\/\d{4}/);
                        if (seasonMatch) {
                            res.Season = seasonMatch[0];
                            res.Competition = compStr.replace(seasonMatch[0], '').trim();
                        } else {
                            res.Competition = compStr.trim();
                            if (res.Date) {
                                let yearMatch = res.Date.match(/\d{4}/);
                                if (yearMatch) res.Season = yearMatch[0];
                            }
                        }
                    }
                } catch(e) {}
            });

            if (res.FT_HomeScore !== null && res.FT_AwayScore !== null) {
                if (res.FT_HomeScore > res.FT_AwayScore) res.Match_Winner_Final = "Home";
                else if (res.FT_HomeScore < res.FT_AwayScore) res.Match_Winner_Final = "Away";
                else res.Match_Winner_Final = "Draw";
            }
            return res;
        }
        """)
        extracted_row.update(score_data)

        # --- PHASE 3: HARMONIZED CORNER ODDS SCRAPER ENGINE ---
        def get_evaluate_tab_state(expected_mains, expected_sub=None):
            import json
            mains_json = json.dumps([m.lower() for m in expected_mains])
            sub_json = json.dumps(expected_sub.lower() if expected_sub else None)
            
            return f"""
        () => {{
            let activeTexts = Array.from(document.querySelectorAll('a, div, span, p, li')).filter(el => {{
                let cls = el.className || "";
                let tid = el.getAttribute('data-testid') || "";
                if (typeof cls !== 'string') return false;
                let isActiveClass = (!cls.toLowerCase().includes('inactive') && cls.toLowerCase().includes('active')) ||
                                    (!tid.toLowerCase().includes('inactive') && tid.toLowerCase().includes('active')) ||
                                    cls.includes('bg-black-main') || cls.includes('text-white-main') || cls.includes('border-black-main') || cls.includes('!border-black-main');
                return isActiveClass;
            }}).map(el => el.innerText.trim().toLowerCase());
            
            let expectedMains = {mains_json};
            let mainMatch = false;
            for (let em of expectedMains) {{
                if (activeTexts.includes(em)) {{ mainMatch = true; break; }}
            }}
            if (!mainMatch) return {{ status: "loading", odds: [] }};
            
            let expectedSub = {sub_json};
            if (expectedSub && !activeTexts.includes(expectedSub)) {{
                return {{ status: "loading", odds: [] }};
            }}

            let extractOddsFromText = (txt) => {{
                let tokens = txt.split(/\s+/);
                let extracted = [];
                for (let t of tokens) {{
                    if (t.includes('%') || t.toLowerCase().includes('payout') || t.toLowerCase().includes('average')) continue;
                    if (t === '-') {{
                        extracted.push(null);
                        continue;
                    }}
                    
                    // Regex Extractors for Valid Odds Formats
                    // Note on Fractional Odds: The regex is strictly bound to `\d{1,3}` (max 3 digits) 
                    // to prevent it from accidentally mathematically converting calendar years (e.g., '2026/2027')
                    // found in page headers into fractional odds and parsing them into massive floats.
                    if (t.match(/^[+-]?\d+\.\d+$/)) {{ // Decimal (1, 2 or 3+ decimals)
                        extracted.push(parseFloat(t));
                    }} else if (t.match(/^\d{1,3}\/\d{1,3}$/)) {{ // Fractional
                        let p = t.split('/');
                        extracted.push((parseFloat(p[0]) / parseFloat(p[1])) + 1);
                    }} else if (t.match(/^[+-]\d+$/)) {{ // American
                        let num = parseFloat(t);
                        if (num > 0) extracted.push((num / 100) + 1);
                        else extracted.push((100 / Math.abs(num)) + 1);
                    }}
                }}
                return extracted;
            }};

            let anyOddsFound = false;
            let bet365Odds = null;
            let fallbackOdds = null;
            
            // --- 1. MODERN STRUCTURED EXTRACTION ---
            let modernRows = document.querySelectorAll('[data-testid="over-under-expanded-row"], [data-testid="bookmaker-table-row"]');
            if (modernRows.length > 0) {{
                for (let row of modernRows) {{
                    let text = row.innerText || '';
                    let isBet365 = text.toLowerCase().includes('bet365') || !!row.querySelector('[title*="bet365" i]');
                    let oddsNodes = row.querySelectorAll('[data-testid="odd-container"] .odds-text, [data-testid="odd-container"] p');
                    
                    if (oddsNodes.length >= 2) {{
                        let oddsArr = Array.from(oddsNodes).map(n => {{
                            let t = n.innerText.trim();
                            if (t === '-') return null;
                            let match = t.match(/^[+-]?\d+\.\d+$/);
                            return match ? parseFloat(t) : null;
                        }});
                        
                        anyOddsFound = true;
                        if (isBet365) {{
                            bet365Odds = oddsArr;
                            break;
                        }} else if (!fallbackOdds) {{
                            fallbackOdds = oddsArr;
                        }}
                    }}
                }}
            }}
            
            // --- 2. FALLBACK GENERIC EXTRACTION ---
            if (!anyOddsFound) {{
                let allElements = Array.from(document.querySelectorAll('div, a, span, p')).reverse();
                for (let el of allElements) {{
                    let text = el.innerText || el.alt || el.title || '';
                    if (text.length > 200 || el.children.length > 15) continue;
                    
                    let lower = text.toLowerCase();
                    if (lower.includes('payout') || lower.includes('average')) continue;
    
                    let oddsArr = extractOddsFromText(text);
                    if (oddsArr.length >= 2) {{
                        anyOddsFound = true; 
                        
                        if (lower.includes('bet365')) {{
                            bet365Odds = oddsArr;
                            break; 
                        }} else if (!fallbackOdds) {{
                            fallbackOdds = oddsArr; 
                        }}
                    }}
                }}
            }}
            
            if (bet365Odds) {{
                return {{ status: "loaded", odds: bet365Odds }};
            }}
            if (anyOddsFound && fallbackOdds) {{
                return {{ status: "loaded", odds: fallbackOdds }};
            }}

            // Check if market is explicitly empty
            let bodyLower = document.body.innerText.toLowerCase();
            if (bodyLower.includes("unfortunately, no matches can be displayed") || 
                bodyLower.includes("no odds available") ||
                bodyLower.includes("no bookmakers offer") ||
                bodyLower.includes("there is no data available") ||
                bodyLower.includes("odds, predictions and h2h results")) {{
                
                if (bodyLower.includes("unfortunately, no matches can be displayed") || 
                    bodyLower.includes("no odds available") ||
                    bodyLower.includes("no bookmakers offer") ||
                    bodyLower.includes("there is no data available")) {{
                    return {{ status: "empty_market", odds: [] }};
                }}
            }}

            return {{ status: "loading", odds: [] }};
        }}
        """

        page_reloaded = False
        
        async def navigate_and_scrape(main_tab_text, sub_tab_text: str = None):
            nonlocal page_reloaded
            main_tab_texts = main_tab_text if isinstance(main_tab_text, list) else [main_tab_text]
            label = f"['{'/'.join(main_tab_texts)}'] -> {sub_tab_text or 'Full Time'}"
            
            for attempt in range(2):
                try:
                    # 1. Click Main Tab safely using visible items
                    # We combine all fallback texts into a single regex.
                    # This prevents Playwright from blindly freezing for 15s waiting for Fallback 1
                    # when Fallback 2 is already instantly visible on the screen.
                    combined_pattern = f"^\\s*({'|'.join(re.escape(t) for t in main_tab_texts)})\\s*$"
                    main_regex = re.compile(combined_pattern, re.I)
                    target = page.get_by_text(main_regex).filter(visible=True).first
                    
                    try:
                        await target.wait_for(timeout=25000)
                    except:
                        pass
                        
                    main_tab = None
                    if await target.count() > 0:
                        main_tab = target
                            
                    if not main_tab:
                        # Check if it's hidden under 'More'
                        more_regex = re.compile(r"^\s*More\s*$", re.I)
                        more_tab = page.get_by_text(more_regex).filter(visible=True).first
                        if await more_tab.count() > 0:
                            await more_tab.click()
                            await page.wait_for_timeout(1000)
                            
                        # Check again with combined regex
                        target = page.get_by_text(main_regex).filter(visible=True).first
                        try:
                            await target.wait_for(timeout=25000)
                        except:
                            pass
                        if await target.count() > 0:
                            main_tab = target

                    if not main_tab:
                        # Fallback to partial match
                        for tab_text in main_tab_texts:
                            main_regex = re.compile(re.escape(tab_text), re.I)
                            target = page.get_by_text(main_regex).filter(visible=True).first
                            if await target.count() > 0:
                                main_tab = target
                                break

                    if main_tab and await main_tab.count() > 0:
                        testid = await main_tab.get_attribute("data-testid") or ""
                        class_val = await main_tab.get_attribute("class") or ""
                        is_active = ("inactive" not in testid.lower() and "active" in testid.lower()) or \
                                    ("inactive" not in class_val.lower() and "active" in class_val.lower())
                        
                        if not is_active:
                            await main_tab.click(timeout=3000)
                            await page.wait_for_timeout(500) # Give React a tiny moment to unmount old data
                    else:
                        if hasattr(self, "is_cancelled") and self.is_cancelled():
                            return []
                        if not page_reloaded and attempt == 0:
                            self.log(f"Smart Refresh: Tab {label} missing. Reloading page...")
                            page_reloaded = True
                            await page.reload(wait_until="domcontentloaded", timeout=30000)
                            await page.wait_for_timeout(3000)
                            continue
                        return []
                    
                    # 2. Click Sub Tab if present
                    if sub_tab_text:
                        sub_regex = re.compile(fr"^\s*{re.escape(sub_tab_text)}\s*$", re.I)
                        sub_tab = page.get_by_text(sub_regex).filter(visible=True).first
                        try:
                            await sub_tab.wait_for(timeout=25000)
                        except:
                            pass
                        if await sub_tab.count() > 0:
                            testid = await sub_tab.get_attribute("data-testid") or ""
                            class_val = await sub_tab.get_attribute("class") or ""
                            is_active = ("inactive" not in testid.lower() and "active" in testid.lower()) or \
                                        ("inactive" not in class_val.lower() and "active" in class_val.lower())
                                        
                            if not is_active:
                                await sub_tab.click(timeout=3000)
                                await page.wait_for_timeout(500) # Give React a tiny moment to unmount old data
                        else:
                            # Sub tab missing, meaning this market segment doesn't exist for this match
                            return []
                    
                    # 3. Smart poll for ANY data to render to confirm load status
                    # We will wait up to 120 seconds (120 loops of 1000ms) for odds to appear.
                    # We will not instantly abort on empty_market, as OddsPortal flashes this while loading.
                    empty_market_count = 0
                    for _ in range(120):
                        await page.wait_for_timeout(1000)
                        state = await page.evaluate(get_evaluate_tab_state(main_tab_texts, sub_tab_text))
                        if state["status"] == "loaded":
                            return state["odds"]
                        elif state["status"] == "empty_market":
                            empty_market_count += 1
                            if empty_market_count >= 15: # Enforce a full 15-second wait before trusting 'empty'
                                await asyncio.sleep(2.0) # Prevent racing through missing tabs
                                return []
                        else:
                            empty_market_count = 0
                            
                    # If we reach here, we timed out
                    if hasattr(self, "is_cancelled") and self.is_cancelled():
                        return []
                    self.log(f"Smart Refresh: Timed out waiting for ANY odds on {label}. Reloading page...")
                    page_reloaded = True
                    await page.reload(wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(4000)
                    continue
                    return []

                except Exception as e:
                    if hasattr(self, "is_cancelled") and self.is_cancelled():
                        return []
                    if not page_reloaded and attempt == 0:
                        self.log(f"Smart Refresh: Error clicking {label}. Reloading page...")
                        page_reloaded = True
                        await page.reload(wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(3000)
                        continue
                    return []
            return []

        # --- PHASE 4: EXECUTE HARVESTING & EXPLICIT BOUND UNPACKING ---
        ft_odds = await navigate_and_scrape("1X2", "Full Time")
        if ft_odds and len(ft_odds) >= 3: extracted_row["FT_HomeOdds"], extracted_row["FT_DrawOdds"], extracted_row["FT_AwayOdds"] = ft_odds[:3]
        h1_odds = await navigate_and_scrape("1X2", "1st Half")
        if h1_odds and len(h1_odds) >= 3: extracted_row["1H_HomeOdds"], extracted_row["1H_DrawOdds"], extracted_row["1H_AwayOdds"] = h1_odds[:3]
        h2_odds = await navigate_and_scrape("1X2", "2nd Half")
        if h2_odds and len(h2_odds) >= 3: extracted_row["SH_HomeOdds"], extracted_row["SH_DrawOdds"], extracted_row["SH_AwayOdds"] = h2_odds[:3]

        # Double Chance Bound-Safe Dynamic Unpacking Map Matrix
        dc_ft = await navigate_and_scrape("Double Chance", "Full Time")
        if dc_ft:
            if len(dc_ft) >= 3: extracted_row["DC_FT_1X"], extracted_row["DC_FT_12"], extracted_row["DC_FT_X2"] = dc_ft[0], dc_ft[1], dc_ft[2]
            elif len(dc_ft) == 2: extracted_row["DC_FT_1X"], extracted_row["DC_FT_12"], extracted_row["DC_FT_X2"] = None, dc_ft[0], dc_ft[1]
            
        dc_1h = await navigate_and_scrape("Double Chance", "1st Half")
        if dc_1h:
            if len(dc_1h) >= 3: extracted_row["DC_1H_1X"], extracted_row["DC_1H_12"], extracted_row["DC_1H_X2"] = dc_1h[0], dc_1h[1], dc_1h[2]
            elif len(dc_1h) == 2: extracted_row["DC_1H_1X"], extracted_row["DC_1H_12"], extracted_row["DC_1H_X2"] = None, dc_1h[0], dc_1h[1]
            
        dc_2h = await navigate_and_scrape("Double Chance", "2nd Half")
        if dc_2h:
            if len(dc_2h) >= 3: extracted_row["DC_2H_1X"], extracted_row["DC_2H_12"], extracted_row["DC_2H_X2"] = dc_2h[0], dc_2h[1], dc_2h[2]
            elif len(dc_2h) == 2: extracted_row["DC_2H_1X"], extracted_row["DC_2H_12"], extracted_row["DC_2H_X2"] = None, dc_2h[0], dc_2h[1]

        dnb_odds = await navigate_and_scrape(["DNB", "Draw No Bet"], "Full Time")
        if dnb_odds and len(dnb_odds) >= 2: extracted_row["DNB_Home"], extracted_row["DNB_Away"] = dnb_odds[:2]

        btts_ft = await navigate_and_scrape("Both Teams to Score", "Full Time")
        if btts_ft and len(btts_ft) >= 2: extracted_row["BTTS_Yes"], extracted_row["BTTS_No"] = btts_ft[:2]
        
        btts_1h = await navigate_and_scrape("Both Teams to Score", "1st Half")
        if btts_1h and len(btts_1h) >= 2: extracted_row["BTTS_1H_Yes"], extracted_row["BTTS_1H_No"] = btts_1h[:2]
        
        btts_2h = await navigate_and_scrape("Both Teams to Score", "2nd Half")
        if btts_2h and len(btts_2h) >= 2: extracted_row["BTTS_2H_Yes"], extracted_row["BTTS_2H_No"] = btts_2h[:2]

        # --- PHASE 5: OVER/UNDER EXPANSION PIPELINE ---
        for attempt in range(2):
            try:
                # Structurally click the Over/Under tab
                target = page.get_by_text(re.compile(r"^Over/Under$", re.I)).filter(visible=True).first
                try:
                    await target.wait_for(timeout=5000)
                except:
                    pass
                if await target.count() > 0:
                    await target.click(timeout=3000)
                else:
                    if not page_reloaded and attempt == 0:
                        self.log("Smart Refresh: Over/Under tab missing. Reloading page...")
                        page_reloaded = True
                        await page.reload(wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(3000)
                        continue
                    break
                        
                # Smart poll for Over/Under data to load
                empty_ou_count = 0
                for _ in range(120):
                    await page.wait_for_timeout(1000)
                    has_rows = await page.evaluate("""
                        () => {
                            if (document.querySelectorAll('[data-testid="over-under-collapsed-row"]').length > 0) return true;
                            let hasLegacy = false;
                            document.querySelectorAll('div, span, p').forEach(b => {
                                let text = b.innerText || '';
                                if (text.trim().match(/^Over\\/Under \\+\\d+(\\.\\d+)?$/i) && b.children.length === 0) hasLegacy = true;
                            });
                            return hasLegacy;
                        }
                    """)
                    if has_rows:
                        break
                    
                    state = await page.evaluate(get_evaluate_tab_state(["Over/Under"], None))
                    if state["status"] == "empty_market":
                        empty_ou_count += 1
                        if empty_ou_count >= 15:
                            break
                    else:
                        empty_ou_count = 0

                await page.wait_for_timeout(5000) # Extra wait for Over/Under data to settle
                
                # Expand all the goal-line accordions so we can see the bookmaker odds
                await page.evaluate("""
                () => {
                    let modernRows = document.querySelectorAll('[data-testid="over-under-collapsed-row"]');
                    if (modernRows.length > 0) {
                        modernRows.forEach(row => row.click());
                        return;
                    }
                    
                    // Legacy fallback
                    document.querySelectorAll('div, span, p').forEach(b => {
                        let text = b.innerText || '';
                        if (text.trim().match(/^Over\\/Under \\+\\d+(\\.\\d+)?$/i) && b.children.length === 0) {
                            let clicker = b.closest('div.flex') || b.parentElement;
                            if (!clicker) return;
                            let container = clicker.parentElement;
                            let innerTable = container ? container.querySelector('div[style*="display: none"], div.hidden') : null;
                            let isCollapsed = innerTable || (clicker.nextElementSibling && clicker.nextElementSibling.clientHeight === 0);
                            
                            if (isCollapsed) {
                                clicker.click();
                            }
                        }
                    });
                }
                """)
                await page.wait_for_timeout(1500) # Give accordions time to physically animate open
                
                content = await page.content()
                with open("scraper_ou_dom.html", "w", encoding="utf-8") as f:
                    f.write(content)

                ou_data = await page.evaluate(r"""
                () => {
                    let results = {};
                    
                    // --- 1. Robust Structured Extraction (Modern UI) ---
                    let rows = document.querySelectorAll('[data-testid="over-under-expanded-row"]');
                    if (rows.length > 0) {
                        let lineCandidates = {};
                        for (let row of rows) {
                            let text = (row.textContent || row.innerText || "").trim();
                            let isBet365 = text.toLowerCase().includes('bet365') || !!row.querySelector('[title*="bet365" i], [alt*="bet365" i]');
                            
                            let totalEl = row.querySelector('[data-testid="total-container"]');
                            let providerDiv = row.querySelector('[provider-name]');
                            let totalStr = totalEl ? (totalEl.textContent || "").trim() : (providerDiv ? providerDiv.getAttribute('provider-name') : "");
                            
                            let match = totalStr.match(/\+?(\d+(?:\.\d+)?)/);
                            if (!match) continue;
                            
                            let val = match[1];
                            if (!val.includes('.')) val = val + ".0";
                            let line = "OU" + val.replace(".", "");
                            
                            let oddsEls = row.querySelectorAll('[data-testid="odd-container"] .odds-text, [data-testid="odd-container"] p');
                            let over = null, under = null;
                            if (oddsEls.length >= 2) {
                                over = parseFloat(oddsEls[0].textContent || oddsEls[0].innerText) || null;
                                under = parseFloat(oddsEls[1].textContent || oddsEls[1].innerText) || null;
                            } else {
                                // Fallback for odds inside the row
                                let odds = [];
                                let tokens = text.split(/\s+/);
                                for (let txt of tokens) {
                                    if (txt.includes('%') || txt.toLowerCase().includes('payout')) continue;
                                    if (txt === '-' || txt.match(/^[+-]?\d+\.\d+$/)) odds.push(txt);
                                }
                                if (odds.length >= 2) {
                                    over = odds[0] === '-' ? null : parseFloat(odds[0]);
                                    under = odds[1] === '-' ? null : parseFloat(odds[1]);
                                }
                            }
                            
                            if (over !== null && under !== null) {
                                if (!lineCandidates[line]) lineCandidates[line] = [];
                                lineCandidates[line].push({ isBet365, over, under });
                            }
                        }
                        
                        for (let line in lineCandidates) {
                            let candidates = lineCandidates[line];
                            if (candidates.length === 0) continue;
                            // Prefer bet365, fallback to the first bookie found
                            let selected = candidates.find(c => c.isBet365) || candidates[0];
                            results[line + "_Over"] = selected.over;
                            results[line + "_Under"] = selected.under;
                        }
                        
                        if (Object.keys(results).length > 0) return results;
                    }

                    // --- 2. Fallback Generic Extraction (Legacy/Alternative UI) ---
                    let lineCandidates = {};
                    let allNodes = Array.from(document.querySelectorAll('div, a')).filter(el => {
                        let t = el.textContent || el.innerText || '';
                        if (t.length > 150) return false;
                        if (t.match(/Over\/Under \+?\d+(\.\d+)?/i)) return true;
                        
                        let oddsCount = (t.match(/\b\d+\.\d+\b/g) || []).length;
                        return oddsCount >= 2;
                    });
                    
                    let currentLine = null;
                    for (let el of allNodes) {
                        let text = el.textContent || el.innerText || "";
                        let match = text.match(/Over\/Under \+?(\d+(?:\.\d+)?)/i);
                        if (match) {
                            let val = match[1];
                            if (!val.includes('.')) val = val + ".0"; 
                            currentLine = "OU" + val.replace(".", "");
                            if (!lineCandidates[currentLine]) lineCandidates[currentLine] = [];
                        } else if (currentLine) {
                            let odds = [];
                            let tokens = text.split(/\s+/);
                            for (let txt of tokens) {
                                if (txt.includes('%') || txt.toLowerCase().includes('payout')) continue;
                                if (txt === '-' || txt.match(/^[+-]?\d+\.\d+$/)) {
                                    odds.push(txt);
                                }
                            }
                            let finalOdds = odds.map(txt => txt === '-' ? null : parseFloat(txt));
                            if (finalOdds.length >= 2) {
                                let isBet365 = text.toLowerCase().includes('bet365') || !!el.querySelector('[title*="bet365" i], [alt*="bet365" i]');
                                lineCandidates[currentLine].push({
                                    isBet365: isBet365,
                                    over: finalOdds[0],
                                    under: finalOdds[1]
                                });
                            }
                        }
                    }
                    
                    for (let line in lineCandidates) {
                        let candidates = lineCandidates[line];
                        if (candidates.length === 0) continue;
                        let selected = candidates.find(c => c.isBet365) || candidates[0];
                        results[line + "_Over"] = selected.over;
                        results[line + "_Under"] = selected.under;
                    }

                    return results;
                }
                """)
                extracted_row.update(ou_data)
                break
            except Exception as e:
                break

        watcher_task.cancel()
        return extracted_row