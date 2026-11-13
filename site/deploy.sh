#!/usr/bin/env bash
# Publica o site pdv.reffix.com.br no Docker Swarm.
# Rode no manager, na pasta do projeto: bash site/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-pdv-pedimais-site:latest}"
STACK="${STACK:-pdv-site}"
export IMAGE
export TRAEFIK_NETWORK="${TRAEFIK_NETWORK:-traefik}"
export TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-websecure}"
export TRAEFIK_CERTRESOLVER="${TRAEFIK_CERTRESOLVER:-letsencrypt}"
export SWARM_NODE="${SWARM_NODE:-$(hostname)}"

swarm_state="$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"
if [[ "$swarm_state" != "active" ]]; then
  echo "Este computador não está em um Docker Swarm ativo." >&2
  exit 1
fi

if ! docker network inspect "$TRAEFIK_NETWORK" >/dev/null 2>&1; then
  echo "A rede ${TRAEFIK_NETWORK} não existe. Ajuste TRAEFIK_NETWORK para a rede do Traefik." >&2
  exit 1
fi

echo "Construindo ${IMAGE} no nó ${SWARM_NODE}"
docker build -f site/Dockerfile -t "$IMAGE" "$ROOT"

echo "Publicando a stack ${STACK}"
docker stack deploy \
  --resolve-image never \
  -c site/docker-compose.yml \
  "$STACK"

echo "Site enviado ao Swarm. O endereço é https://pdv.reffix.com.br"
docker stack services "$STACK"
