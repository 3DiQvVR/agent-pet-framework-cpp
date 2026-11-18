FROM python:3.12-slim
WORKDIR /app
COPY migration/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY migration/service /app/migration/service
COPY cards /app/cards
USER 65534
CMD ["uvicorn","migration.service.api:app","--host","0.0.0.0","--port","8000"]
