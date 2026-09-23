.PHONY: dev dev-all up down down-compose logs ps install typecheck lint test eval clean

# docker compose v2 plugin (`docker compose`) or standalone binary (`docker-compose`)
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
# Pin project directory to repo root so relative paths resolve identically
# across compose implementations.
COMPOSE_BASE := --project-directory $(CURDIR) -f infra/docker-compose.yml

install:
	bun install
	uv sync --project services/vision-worker

.env:
	cp .env.example .env
	@echo "created .env from .env.example — add your GROQ_API_KEY"

dev:
	bun run dev

# Full local stack (docker DB + native worker/api/web) with live logs.
# Ctrl-C stops everything, including docker.
dev-all:
	./scripts/local.sh up --follow

# Stop everything: native servers + docker DB (+ compose stack if present).
down:
	./scripts/local.sh down

up: .env
	$(COMPOSE) $(COMPOSE_BASE) --env-file .env up --build

down-compose:
	$(COMPOSE) $(COMPOSE_BASE) down

logs:
	$(COMPOSE) $(COMPOSE_BASE) logs -f

ps:
	$(COMPOSE) $(COMPOSE_BASE) ps

typecheck:
	bun run typecheck

lint:
	bunx biome check .

test:
	bun run test

eval:
	bun run --filter api eval || uv run --project services/vision-worker pytest -m eval

clean:
	rm -rf node_modules apps/*/node_modules .venv
