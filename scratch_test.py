import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = await context.new_page()
        # Add simple stealth
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        await page.goto('https://www.oddsportal.com/football/england/premier-league/results/', wait_until='domcontentloaded')
        await page.wait_for_timeout(5000)
        
        # Get all links
        links = await page.evaluate('Array.from(document.querySelectorAll("a")).map(a => a.href)')
        valid_links = []
        import re
        for l in links:
            if '/football/' in l and '-' in l:
                valid_links.append(l)
                
        print("First 30 football matches:")
        for l in valid_links[:30]:
            print(l)
            
        await browser.close()

asyncio.run(run())
