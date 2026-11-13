#!/usr/bin/env bash
# Publica o site pdv.reffix.com.br no Docker Swarm.
# Rode no manager, na pasta do projeto: bash site/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-pdv-pedimais-site:latest}"
STACK="${STACK:-pdv-site}"
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
  task_id="$(docker ps -q --filter "label=com.docker.swarm.service.name=${name}" | head -n 1 || true)"
  if [[ -n "$task_id" ]]; then
    remember_args "$(docker inspect "$task_id" --format '{{json .Args}}')"
  fi
  break
done < <(docker service ls --format '{{.Name}} {{.Image}}')

if [[ "$found_traefik" -eq 0 ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    cid="${line%% *}"
    rest="${line#* }"
    if [[ "$(lower "$rest")" != *traefik* ]]; then
      continue
    fi
    found_traefik=1
    echo "Traefik encontrado no container ${cid}"
    while IFS= read -r ref; do
      add_network "$ref"
    done < <(docker inspect "$cid" --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}')
    remember_args "$(docker inspect "$cid" --format '{{json .Config.Cmd}}')"
    remember_args "$(docker inspect "$cid" --format '{{json .Args}}')"
    break
  done < <(docker ps --format '{{.ID}} {{.Image}} {{.Names}}')
fi

if [[ -n "${TRAEFIK_NETWORK:-}" ]] && docker network inspect "$TRAEFIK_NETWORK" >/dev/null 2>&1; then
  export TRAEFIK_NETWORK
elif [[ "${#traefik_networks[@]}" -eq 1 ]]; then
  if [[ -n "${TRAEFIK_NETWORK:-}" ]]; then
    echo "A rede ${TRAEFIK_NETWORK} não existe. Usando ${traefik_networks[0]}."
  fi
  export TRAEFIK_NETWORK="${traefik_networks[0]}"
elif [[ "${#traefik_networks[@]}" -gt 1 ]]; then
  chosen=""
  local_needles=(public proxy edge web traefik)
  for needle in "${local_needles[@]}"; do
    for candidate in "${traefik_networks[@]}"; do
      if [[ "$(lower "$candidate")" == *"$needle"* ]]; then
        chosen="$candidate"
        break 2
      fi
    done
  done
  if [[ -z "$chosen" ]]; then
    echo "O Traefik está em mais de uma rede. Escolha uma e exporte TRAEFIK_NETWORK:" >&2
    printf '  %s\n' "${traefik_networks[@]}" >&2
    exit 1
  fi
  echo "A rede do Traefik usada pelo site é ${chosen}."
  export TRAEFIK_NETWORK="$chosen"
else
  echo "Não encontrei a rede do Traefik. Redes overlay deste Swarm:" >&2
  docker network ls --filter driver=overlay --format '  {{.Name}}' >&2
  echo "Exporte TRAEFIK_NETWORK com o nome certo e rode de novo." >&2
  exit 1
fi

discovered_entrypoint="$(printf '%s' "$traefik_args" | grep -oE 'entrypoints\.[A-Za-z0-9_-]+\.address=:443' | head -n 1 | sed -E 's/entrypoints\.([A-Za-z0-9_-]+)\.address=:443/\1/' || true)"
discovered_resolver="$(printf '%s' "$traefik_args" | grep -oE 'certificatesresolvers\.[A-Za-z0-9_-]+' | head -n 1 | cut -d. -f2 || true)"

if [[ -n "${TRAEFIK_ENTRYPOINT:-}" && "$traefik_args" == *"entrypoints.${TRAEFIK_ENTRYPOINT}."* ]]; then
  export TRAEFIK_ENTRYPOINT
elif [[ -n "$discovered_entrypoint" ]]; then
  export TRAEFIK_ENTRYPOINT="$discovered_entrypoint"
else
  export TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-websecure}"
fi

if [[ -n "${TRAEFIK_CERTRESOLVER:-}" && "$traefik_args" == *"certificatesresolvers.${TRAEFIK_CERTRESOLVER}."* ]]; then
  export TRAEFIK_CERTRESOLVER
elif [[ -n "$discovered_resolver" ]]; then
  export TRAEFIK_CERTRESOLVER="$discovered_resolver"
else
  export TRAEFIK_CERTRESOLVER="${TRAEFIK_CERTRESOLVER:-letsencrypt}"
fi

echo "Rede ${TRAEFIK_NETWORK}, entrada ${TRAEFIK_ENTRYPOINT}, certificado ${TRAEFIK_CERTRESOLVER}"

echo "Construindo ${IMAGE} no nó ${SWARM_NODE}"
docker build -f site/Dockerfile -t "$IMAGE" "$ROOT"

echo "Publicando a stack ${STACK}"
docker stack deploy \
  --resolve-image never \
  -c site/docker-compose.yml \
  "$STACK"

service_name="${STACK}_site"
update_help="$(docker service update --help 2>&1 || true)"
if [[ "$update_help" == *"--pull-policy"* ]]; then
  docker service update --detach --pull-policy never "$service_name"
fi

echo "Site enviado ao Swarm. O endereço é https://pdv.reffix.com.br"
docker stack services "$STACK"
docker service ps "$service_name" --no-trunc || true
