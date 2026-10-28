FROM openscad/openscad:latest

RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /app/server.py
WORKDIR /app

EXPOSE 8080
CMD ["python3", "server.py"]
