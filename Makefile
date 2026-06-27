# Observatorio Nacional de Justicia del Peru
# Atajos del flujo de datos y despliegue.

.DEFAULT_GOAL := help
PYTHON ?= python3

.PHONY: help data db serve clean

help: ## Muestra esta ayuda
	@echo "Observatorio Nacional de Justicia del Peru - targets disponibles:"
	@echo "  make data   - Genera los datos sinteticos en site/data/*.json"
	@echo "  make db     - Construye la base DuckDB en data/processed/justicia.duckdb"
	@echo "  make serve  - Sirve el dashboard estatico en http://localhost:8000"
	@echo "  make clean  - Borra data/processed y site/data (conserva .gitkeep)"

data: ## Genera los datos sinteticos
	$(PYTHON) etl/generate_synthetic.py

db: ## Carga los JSON a DuckDB
	$(PYTHON) etl/pipeline/build_db.py

serve: ## Sirve el sitio estatico localmente
	cd site && $(PYTHON) -m http.server 8000

clean: ## Limpia datos procesados y generados (conserva .gitkeep)
	rm -rf data/processed/*
	find site/data -type f ! -name '.gitkeep' -delete
	@echo "Limpieza completa."
