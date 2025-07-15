FROM --platform=$BUILDPLATFORM ubuntu:22.04
ARG TARGETPLATFORM
ARG BUILDPLATFORM

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=18.17.0
ENV PYTHON_VERSION=3.10

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    software-properties-common \
    build-essential \
    git \
    supervisor \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

RUN python --version && pip --version && node --version && npm --version

RUN pip install --upgrade pip setuptools wheel

COPY medhamanthan-frontend/ ./frontend/
COPY medhamanthan/ ./backend/

WORKDIR /app/backend
COPY medhamanthan/requirements.txt ./
RUN pip install -r requirements.txt

WORKDIR /app/frontend
COPY medhamanthan-frontend/package*.json ./
RUN npm install && npm run build

WORKDIR /app
RUN mkdir -p /var/log/supervisor /etc/supervisor

RUN echo "[supervisord]" > /etc/supervisor/supervisord.conf && \
    echo "nodaemon=true" >> /etc/supervisor/supervisord.conf && \
    echo "user=root" >> /etc/supervisor/supervisord.conf && \
    echo "logfile=/var/log/supervisor/supervisord.log" >> /etc/supervisor/supervisord.conf && \
    echo "loglevel=info" >> /etc/supervisor/supervisord.conf && \
    echo "pidfile=/var/run/supervisord.pid" >> /etc/supervisor/supervisord.conf && \
    echo "[include]" >> /etc/supervisor/supervisord.conf && \
    echo "files = /etc/supervisor/conf.d/*.conf" >> /etc/supervisor/supervisord.conf

RUN mkdir -p /etc/supervisor/conf.d && \
    echo '[program:fastapi]' > /etc/supervisor/conf.d/app.conf && \
    echo 'command=python -m uvicorn main:app --host 0.0.0.0 --port 8000' >> /etc/supervisor/conf.d/app.conf && \
    echo 'directory=/app/backend' >> /etc/supervisor/conf.d/app.conf && \
    echo 'autostart=true' >> /etc/supervisor/conf.d/app.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/app.conf && \
    echo 'stderr_logfile=/var/log/supervisor/fastapi.err.log' >> /etc/supervisor/conf.d/app.conf && \
    echo 'stdout_logfile=/var/log/supervisor/fastapi.out.log' >> /etc/supervisor/conf.d/app.conf && \
    echo '' >> /etc/supervisor/conf.d/app.conf && \
    echo '[program:nextjs]' >> /etc/supervisor/conf.d/app.conf && \
    echo 'command=npm start' >> /etc/supervisor/conf.d/app.conf && \
    echo 'directory=/app/frontend' >> /etc/supervisor/conf.d/app.conf && \
    echo 'autostart=true' >> /etc/supervisor/conf.d/app.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/app.conf && \
    echo 'stderr_logfile=/var/log/supervisor/nextjs.err.log' >> /etc/supervisor/conf.d/app.conf && \
    echo 'stdout_logfile=/var/log/supervisor/nextjs.out.log' >> /etc/supervisor/conf.d/app.conf

EXPOSE 3000 8000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
