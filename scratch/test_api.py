import urllib.request
import json
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/execute',
    data=b'{"nodes":[], "edges":[]}',
    headers={'Content-Type': 'application/json'}
)
print(urllib.request.urlopen(req).read().decode())
