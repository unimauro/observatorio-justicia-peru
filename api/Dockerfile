FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app/api
ENV MODELS_DIR=/app/models
EXPOSE 8088
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8088"]
