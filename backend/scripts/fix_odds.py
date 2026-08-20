import os

files = [
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_historical.py',
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_historical_v2.py',
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_upcoming.py'
]

target1 = '''                            if (isBet365) {{
                                bet365Odds = oddsArr;
                                break;
                            }} else if (!fallbackOdds) {{
                                fallbackOdds = oddsArr;
                            }}'''

replace1 = '''                            if (isBet365) {{
                                bet365Odds = oddsArr;
                                break;
                            }} else if (!fallbackOdds || (fallbackOdds.includes(null) && !oddsArr.includes(null))) {{
                                fallbackOdds = oddsArr;
                            }}'''

target2 = '''                        if (lower.includes('bet365')) {{
                            bet365Odds = oddsArr;
                            break; 
                        }} else if (!fallbackOdds) {{
                            fallbackOdds = oddsArr; 
                        }}'''

replace2 = '''                        if (lower.includes('bet365')) {{
                            bet365Odds = oddsArr;
                            break; 
                        }} else if (!fallbackOdds || (fallbackOdds.includes(null) && !oddsArr.includes(null))) {{
                            fallbackOdds = oddsArr; 
                        }}'''

for path in files:
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f:
        t = f.read()
    
    t = t.replace(target1, replace1)
    t = t.replace(target2, replace2)
    
    # Also replace Double Chance odds count
    t = t.replace('navigate_and_scrape("Double Chance", "Full Time", 2)', 'navigate_and_scrape("Double Chance", "Full Time", 3)')
    t = t.replace('navigate_and_scrape("Double Chance", "1st Half", 2)', 'navigate_and_scrape("Double Chance", "1st Half", 3)')
    t = t.replace('navigate_and_scrape("Double Chance", "2nd Half", 2)', 'navigate_and_scrape("Double Chance", "2nd Half", 3)')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(t)

print("Done")
