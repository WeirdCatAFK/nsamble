FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openscad python3 python3-pip xvfb \
    && pip3 install --no-cache-dir --break-system-packages 'openscad-mcp==0.6.1' 'mcp==2.3.0' \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /app/server.py
WORKDIR /app

EXPOSE 8083
CMD ["python3", "server.py"]
