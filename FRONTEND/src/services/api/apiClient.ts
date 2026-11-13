/**
 * Arquivo: src/services/api/apiClient.ts
 * Objetivo: centralizar chamadas HTTP para a API .NET do Hórus PDV.
 * Entradas esperadas: recebe caminho, método e payload opcional para executar requisições autenticadas.
 */
import { clearAuthSession, getAuthRemember, getStoredAuthToken, setAuthSession, type AuthenticatedUser } from "@/utils/authStorage";
import { enqueueOutbox, readJsonCache, writeJsonCache } from "@/services/offline/outbox";

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  details?: string;
  data?: T;
  savedOffline?: boolean;
};

type ApiRequestOptions = RequestInit & {
  skipAuth?: boolean;
  skipRefresh?: boolean;
  offlineQueue?: boolean;
  cacheKey?: string;
};

export class TransportError extends Error {
  constructor() {
    super("Não foi possível falar com a API. Verifique se o servidor do caixa está aberto.");
    this.name = "TransportError";
  }
}

export class SavedOfflineError extends Error {
  readonly localId: string;

  constructor(localId: string) {
    super("Sem conexão. A operação ficou guardada neste caixa e será enviada quando a internet voltar.");
    this.name = "SavedOfflineError";
    this.localId = localId;
  }
}

class SessionExpiredError extends Error {
  constructor() {
    super("Sessão expirada ou token inválido.");
    this.name = "SessionExpiredError";
  }
}

const AUTH_REFRESH_URL =
  `${import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:5260/api/Auth"}/refresh`;

let renewingToken: Promise<boolean> | null = null;

async function renewStoredToken() {
  if (!renewingToken) {
    renewingToken = renewStoredTokenOnce().finally(() => {
      renewingToken = null;
    });
  }
  return renewingToken;
}

async function renewStoredTokenOnce() {
  const token = getStoredAuthToken();
  let response: Response;
  try {
    response = await fetch(resolveApiUrl(AUTH_REFRESH_URL), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new TransportError();
  }

  if (response.status === 401) return false;
  if (!response.ok) throw new TransportError();
  const payload = (await response.json()) as ApiResponse<{ token?: string; user?: AuthenticatedUser }>;
  if (!payload.data?.token || !payload.data.user) return false;
  setAuthSession(payload.data.user, getAuthRemember(), payload.data.token);
  return true;
}

function resolveApiUrl(endpointUrl: string) {
  if (typeof window === "undefined") return endpointUrl;
  if (endpointUrl.startsWith("/")) {
    return new URL(endpointUrl, window.location.origin).toString();
  }

  try {
    const url = new URL(endpointUrl);
    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (localHost && url.port === "5260") {
      return new URL(`${url.pathname}${url.search}`, window.location.origin).toString();
    }
  } catch {
    return endpointUrl;
  }

  return endpointUrl;
}

function isTransportStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

async function performRequest<T>(
  endpointUrl: string,
  options: ApiRequestOptions,
): Promise<ApiResponse<T>> {
  const { skipAuth, skipRefresh: _skipRefresh, offlineQueue: _offlineQueue, cacheKey, headers, ...requestOptions } = options;
  const token = skipAuth ? "" : getStoredAuthToken();
  let response: Response;
  try {
    response = await fetch(resolveApiUrl(endpointUrl), {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...requestOptions,
    });
  } catch {
    throw new TransportError();
  }

  if (isTransportStatus(response.status)) {
    throw new TransportError();
  }

  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();
  let payload: ApiResponse<T>;
  if (contentType.includes("json") && rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as ApiResponse<T> & { title?: string };
      payload = {
        ...parsed,
        message: parsed.message || parsed.title || "",
      };
    } catch {
      payload = {
        success: false,
        message: "A API respondeu em um formato inesperado.",
      };
    }
  } else {
    payload = {
      success: response.ok,
      message: response.ok
        ? "Operação concluída."
        : "Não foi possível falar com a API. Tente de novo em alguns segundos.",
    };
  }

  if (response.status === 401) {
    if (options.skipAuth) {
      throw new Error(payload.message || "E-mail ou senha inválidos.");
    }
    if (options.skipRefresh) {
      clearAuthSession();
      throw new Error(payload.message || "Sessão expirada ou token inválido.");
    }
    throw new SessionExpiredError();
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Erro ao comunicar com a API.");
  }

  if (cacheKey) writeJsonCache(cacheKey, payload.data);
  return payload;
}

export async function apiRequest<T>(
  endpointUrl: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  try {
    return await performRequest<T>(endpointUrl, options);
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      try {
        const renewed = await renewStoredToken();
        if (renewed) {
          return await performRequest<T>(endpointUrl, { ...options, skipRefresh: true });
        }
      } catch (renewError) {
        if (renewError instanceof TransportError) throw renewError;
        throw renewError;
      }
      clearAuthSession();
      throw new Error("Sessão expirada ou token inválido.");
    }

    if (!(error instanceof TransportError)) throw error;

    if (options.cacheKey && !options.offlineQueue) {
      const cached = readJsonCache<T>(options.cacheKey);
      if (cached !== undefined) {
        return { success: true, message: "", data: cached };
      }
    }

    if (!options.offlineQueue) throw error;

    try {
      return await performRequest<T>(endpointUrl, options);
    } catch (second) {
      if (!(second instanceof TransportError)) throw second;
      const localId = enqueueOutbox({
        url: resolveApiUrl(endpointUrl),
        method: options.method || "POST",
        body: typeof options.body === "string" ? options.body : undefined,
      });
      throw new SavedOfflineError(localId);
    }
  }
}
