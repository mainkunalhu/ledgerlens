.PHONY: dev up down logs ps install typecheck lint test eval clean

install:
	bun install
	uv sync --project services/vision-worker

dev:
	bun run dev

up:
	docker compose -f infra/docker-compose.yml --env-file .env up --build

down:
	docker compose -f infra/docker-compose.yml down

logs:
	docker compose -f infra/docker-compose.yml logs -f

ps:
	docker compose -f infra/docker-compose.yml ps

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
