FROM ubuntu:22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       software-properties-common gpg-agent \
    && add-apt-repository ppa:kicad/kicad-8.0-releases \
    && apt-get update \
    && apt-get install -y --no-install-recommends kicad python3 xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /app/server.py
WORKDIR /app

EXPOSE 8081
CMD ["python3", "server.py"]
