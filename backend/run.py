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
    
    # Filter out /api/status endpoint from access logs to prevent terminal spam
    import logging
    class EndpointFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            return record.args and len(record.args) >= 3 and "/api/status" not in record.args[2]

    # Apply the filter after uvicorn initializes its loggers
    # We will do this by wrapping the uvicorn run command or by passing a custom config
    # Actually, uvicorn doesn't make it trivial to pass filters via config dict natively,
    # so we will just run it, but configure the root logger if possible.
    # Alternatively, we can just disable the access log entirely or use the filter workaround.
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=True, log_config=log_config)
