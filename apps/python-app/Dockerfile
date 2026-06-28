FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt && \
    opentelemetry-bootstrap --action=install

COPY app.py .

EXPOSE 5000

# We use opentelemetry-instrument command wrapper to automatically configure trace/metric generation
CMD ["opentelemetry-instrument", "python", "app.py"]
