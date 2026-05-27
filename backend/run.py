import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting VibeETL Engine on port {port}...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=True)
