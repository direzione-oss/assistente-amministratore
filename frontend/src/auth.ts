export const AUTH_TOKEN_KEY = 'assistente_auth_token';
export const AUTH_UNAUTHORIZED_EVENT = 'assistente:unauthorized';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage error
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore storage error
  }
}

let interceptorInstalled = false;

export function installAuthFetchInterceptor(): void {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isApiCall =
      urlStr.startsWith('/api/') ||
      urlStr.includes('/api/');

    if (!isApiCall) {
      return originalFetch(input, init);
    }

    const token = getStoredToken();
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const nextInit: RequestInit = {
      ...init,
      headers,
      credentials: init?.credentials ?? 'same-origin',
    };

    const response = await originalFetch(input, nextInit);

    if (
      response.status === 401 &&
      !urlStr.includes('/api/auth/login') &&
      !urlStr.includes('/api/auth/me')
    ) {
      clearStoredToken();
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }

    return response;
  };
}
