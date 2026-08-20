import os

files = [
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_historical.py',
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_historical_v2.py',
    r'd:\Project\VibeETL\backend\app\tools\odds_portal_upcoming.py'
]

target = '''                // We do NOT return rows_present_no_odds here, because we want to try the fallback generic extraction!
            }'''

replace = '''                if (!anyOddsFound) {
                    return { status: "rows_present_no_odds", odds: [] };
                }
            }'''

for path in files:
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f:
        t = f.read()
    
    t = t.replace(target, replace)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(t)

print("Done")
