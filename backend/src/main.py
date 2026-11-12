from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
import uvicorn

from config.config import settings
from fast_api.routes import router
from fast_api.services import finish_pending_clear
from qdrant.qdrant_manager import close_qdrant_client, initialize_qdrant_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.profile_dir.mkdir(parents=True, exist_ok=True)
    try:
        initialize_qdrant_client()
        finish_pending_clear()
    except Exception:
        close_qdrant_client()
        raise RuntimeError(
            "Cannot open Browser Brain's Qdrant collection. Check QDRANT_URL, "
            "collection settings and write access to BROWSER_BRAIN_DATA."
        ) from None
    if not settings.provider_ready:
        logging.getLogger("uvicorn.error").warning("Set OPENAI_API_KEY in backend/.env to enable indexing and search.")
    try:
        yield
    finally:
        close_qdrant_client()


app = FastAPI(lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])


@app.middleware("http")
async def block_web_origins(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and not origin.startswith("chrome-extension://"):
        return JSONResponse({"detail": "Use the Browser Brain extension or a local CLI."}, status_code=403)
    return await call_next(request)


app.include_router(router)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, access_log=False)
