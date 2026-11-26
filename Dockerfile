# ---- stage 1: vendor three.js (served locally, so the app works without internet) ----
FROM node:22-alpine AS vendor
WORKDIR /v
RUN npm pack three@0.170.0 --silent \
 && tar xzf three-0.170.0.tgz \
 && mkdir -p out/build out/addons/controls \
 && cp package/build/*.js out/build/ \
 && cp package/examples/jsm/controls/OrbitControls.js out/addons/controls/ \
 && cp package/LICENSE out/LICENSE

# ---- stage 2: app ----
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    LIBRARY_DIRS=/library \
    PORT=8080 \
    MALLOC_ARENA_MAX=2
WORKDIR /app
# OpenSCAD renders .scad files to STL for previews, 3D view and "Open in slicer" (~300 MB).
# Build without it:  docker compose build --build-arg WITH_OPENSCAD=0
ARG WITH_OPENSCAD=1
ENV QT_QPA_PLATFORM=offscreen
RUN if [ "$WITH_OPENSCAD" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends openscad fontconfig fonts-liberation2 fonts-dejavu-core \
      && rm -rf /var/lib/apt/lists/*; \
    fi
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# STEP/STP previews: OpenCASCADE through cascadio + trimesh (~100 MB). Optional – if no wheel is available for this
# platform the build continues and STEP files just keep their folder-image preview.
# Build without it:  docker compose build --build-arg WITH_STEP=0
ARG WITH_STEP=1
RUN if [ "$WITH_STEP" = "1" ]; then \
      (apt-get update && apt-get install -y --no-install-recommends libgomp1 libgl1 libxrender1 libxext6 \
        && rm -rf /var/lib/apt/lists/*) ; \
      pip install --no-cache-dir "trimesh>=4.4" cascadio \
        || echo "WARNING: STEP support (cascadio) not available for this platform - continuing without it"; \
    fi
COPY app/ /app/
COPY --from=vendor /v/out /app/static/vendor/three
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data /library
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/api/me' % os.environ.get('PORT','8080'), timeout=4)" || exit 1
ENTRYPOINT ["/entrypoint.sh"]
# one worker process on purpose: the scanner/preview worker runs as a background thread in it
CMD ["sh", "-c", "exec gunicorn --workers 1 --threads ${THREADS:-16} --timeout 900 --bind 0.0.0.0:${PORT} --access-logfile - app:app"]
