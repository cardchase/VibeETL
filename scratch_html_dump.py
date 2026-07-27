import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        )
        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        await page.goto('https://www.oddsportal.com/football/england/premier-league/results/', wait_until='domcontentloaded')
        await page.wait_for_timeout(5000)
        
        # Get raw html
        html = await page.evaluate('document.body.innerHTML')
        with open('d:/Project/VibeETL/scratch_odds.html', 'w', encoding='utf-8') as f:
            f.write(html)
            
        await browser.close()

asyncio.run(run())
