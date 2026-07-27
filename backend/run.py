import uvicorn
import os
import copy

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting VibeETL Engine on port {port}...")
    
    # Add timestamps to the terminal logs
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    log_config["formatters"]["default"]["fmt"] = "[%(asctime)s] %(levelprefix)s %(message)s"
    log_config["formatters"]["default"]["datefmt"] = "%H:%M:%S"
    log_config["formatters"]["access"]["fmt"] = "[%(asctime)s] %(levelprefix)s %(client_addr)s - \"%(request_line)s\" %(status_code)s"
    log_config["formatters"]["access"]["datefmt"] = "%H:%M:%S"
    
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=True, log_config=log_config)
