#!/usr/bin/env bash
# Publica a API em https://apipdv.reffix.com.br e liga no Postgres que já está no Swarm.
# Rode no manager, na pasta do projeto: bash API/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-pdv-pedimais-api:latest}"
STACK="${STACK:-pdv-api}"
export IMAGE
node_name="$(docker info --format '{{.Name}}' 2>/dev/null || true)"
export SWARM_NODE="${SWARM_NODE:-${node_name:-$(hostname)}}"

swarm_state="$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"
if [[ "$swarm_state" != "active" ]]; then
  echo "Este computador não está em um Docker Swarm ativo." >&2
  exit 1
fi

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

traefik_args=""
traefik_networks=()

add_network() {
  local ref="$1"
  local described name driver
  [[ -n "$ref" ]] || return 0
  described="$(docker network inspect "$ref" --format '{{.Name}} {{.Driver}}' 2>/dev/null || true)"
  [[ -n "$described" ]] || return 0
  name="${described%% *}"
  driver="${described#* }"
  [[ "$(lower "$driver")" == "overlay" ]] || return 0
  case "$(lower "$name")" in
    ingress|docker_gwbridge|bridge|host|none) return 0 ;;
  esac
  if [[ "${#traefik_networks[@]}" -gt 0 ]]; then
    local existing
    for existing in "${traefik_networks[@]}"; do
      [[ "$existing" == "$name" ]] && return 0
    done
  fi
  traefik_networks+=("$name")
}

remember_args() {
  [[ -n "$1" && "$1" != "null" && "$1" != "[]" ]] || return 0
  traefik_args+=" $1"
}

found_traefik=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  name="${line%% *}"
  image="${line#* }"
  if [[ "$(lower "$name")" != *traefik* && "$(lower "$image")" != *traefik* ]]; then
    continue
  fi
  found_traefik=1
  echo "Traefik encontrado no serviço ${name}"
  while IFS= read -r ref; do
    add_network "$ref"
  done < <(docker service inspect "$name" --format '{{range .Endpoint.VirtualIPs}}{{.NetworkID}}{{"\n"}}{{end}}{{range .Spec.TaskTemplate.Networks}}{{.Target}}{{"\n"}}{{end}}')
  remember_args "$(docker service inspect "$name" --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}')"
  remember_args "$(docker service inspect "$name" --format '{{json .Spec.TaskTemplate.ContainerSpec.Command}}')"
  break
done < <(docker service ls --format '{{.Name}} {{.Image}}')

if [[ -n "${TRAEFIK_NETWORK:-}" ]] && docker network inspect "$TRAEFIK_NETWORK" >/dev/null 2>&1; then
  export TRAEFIK_NETWORK
elif [[ "${#traefik_networks[@]}" -ge 1 ]]; then
  export TRAEFIK_NETWORK="${traefik_networks[0]}"
else
  echo "Não encontrei a rede do Traefik." >&2
  exit 1
fi

discovered_entrypoint="$(printf '%s' "$traefik_args" | grep -oE 'entrypoints\.[A-Za-z0-9_-]+\.address=:443' | head -n 1 | sed -E 's/entrypoints\.([A-Za-z0-9_-]+)\.address=:443/\1/' || true)"
discovered_resolver="$(printf '%s' "$traefik_args" | grep -oE 'certificatesresolvers\.[A-Za-z0-9_-]+' | head -n 1 | cut -d. -f2 || true)"
export TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-${discovered_entrypoint:-websecure}}"
export TRAEFIK_CERTRESOLVER="${TRAEFIK_CERTRESOLVER:-${discovered_resolver:-letsencryptresolver}}"

postgres_service=""
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  name="${line%% *}"
  image="${line#* }"
  if [[ "$(lower "$name")" == *postgres* || "$(lower "$image")" == *postgres* || "$(lower "$image")" == *pgvector* ]]; then
    postgres_service="$name"
    break
  fi
done < <(docker service ls --format '{{.Name}} {{.Image}}')

if [[ -z "$postgres_service" ]]; then
  echo "Não encontrei o serviço do Postgres neste Swarm." >&2
  exit 1
fi

echo "Postgres encontrado no serviço ${postgres_service}"
export POSTGRES_HOST="$postgres_service"

postgres_networks=()
while IFS= read -r ref; do
  described="$(docker network inspect "$ref" --format '{{.Name}} {{.Driver}}' 2>/dev/null || true)"
  [[ -n "$described" ]] || continue
  net_name="${described%% *}"
  net_driver="${described#* }"
  [[ "$(lower "$net_driver")" == "overlay" ]] || continue
  case "$(lower "$net_name")" in
    ingress|docker_gwbridge) continue ;;
  esac
  postgres_networks+=("$net_name")
done < <(docker service inspect "$postgres_service" --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}}{{"\n"}}{{end}}')

if [[ -z "${POSTGRES_NETWORK:-}" ]]; then
  if [[ "${#postgres_networks[@]}" -gt 0 ]]; then
    POSTGRES_NETWORK="${postgres_networks[0]}"
  else
    POSTGRES_NETWORK="$TRAEFIK_NETWORK"
  fi
fi
export POSTGRES_NETWORK

pg_user="postgres"
pg_password=""
while IFS= read -r env_line; do
  case "$env_line" in
    POSTGRES_USER=*) pg_user="${env_line#POSTGRES_USER=}" ;;
    POSTGRES_PASSWORD=*) pg_password="${env_line#POSTGRES_PASSWORD=}" ;;
  esac
done < <(docker service inspect "$postgres_service" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}')

if [[ -n "$pg_password" ]]; then
  export PDV_CONNECTION_STRING="Host=${POSTGRES_HOST};Port=5432;Database=pdv_pedimais;Username=${pg_user};Password=${pg_password}"
else
  export PDV_CONNECTION_STRING="Host=${POSTGRES_HOST};Port=5432;Database=pdv_pedimais;Username=${pg_user}"
fi

secrets_file="$ROOT/API/secrets.env"
if [[ ! -f "$secrets_file" ]]; then
  umask 077
  jwt_secret="$(openssl rand -base64 48 | tr -d '\n')"
  encryption_key="$(openssl rand -base64 48 | tr -d '\n')"
  printf 'AUTH_JWT_SECRET=%s\nSECURITY_ENCRYPTION_KEY=%s\n' "$jwt_secret" "$encryption_key" > "$secrets_file"
  echo "Segredos da API gravados em API/secrets.env. Esse arquivo fica só neste servidor."
fi
# shellcheck disable=SC1090
set -a
source "$secrets_file"
set +a
export AUTH_JWT_SECRET SECURITY_ENCRYPTION_KEY

echo "Rede do Traefik ${TRAEFIK_NETWORK}, rede do Postgres ${POSTGRES_NETWORK}"
echo "Construindo ${IMAGE} no nó ${SWARM_NODE}"
docker build -f API/NETCORE/Dockerfile -t "$IMAGE" API/NETCORE

compose_files=(-c API/docker-compose.yml)
if [[ "$POSTGRES_NETWORK" != "$TRAEFIK_NETWORK" ]]; then
  compose_files+=(-c API/docker-compose.database.yml)
fi

echo "Publicando a stack ${STACK}"
docker stack deploy --resolve-image never "${compose_files[@]}" "$STACK"

service_name="${STACK}_api"
update_help="$(docker service update --help 2>&1 || true)"
if [[ "$update_help" == *"--pull-policy"* ]]; then
  docker service update --detach --force --pull-policy never "$service_name"
else
  docker service update --detach --force "$service_name"
fi

echo "API enviada ao Swarm. O endereço é https://apipdv.reffix.com.br"
docker stack services "$STACK"
docker service ps "$service_name" --no-trunc || true
