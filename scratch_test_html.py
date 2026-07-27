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
        
        # Get the first match row HTML
        row_html = await page.evaluate('''() => {
            let row = document.querySelector('[data-testid="game-row"], .flex.flex-col > .flex.border-black-borders');
            if (!row) row = document.querySelector('.flex.flex-col > div[class*="border-b"]');
            return row ? row.outerHTML : "Not found";
        }''')
        
        print("MATCH ROW HTML:")
        print(row_html)
            
        await browser.close()

asyncio.run(run())
