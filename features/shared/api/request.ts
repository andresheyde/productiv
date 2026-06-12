import { apiBaseUrl } from "./config";

type ApiRequestOptions = RequestInit & {
  sessionToken?: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(
  path: string,
  options: ApiRequestOptions = {},
) {
  const { headers, sessionToken, ...requestInit } = options;
  const requestHeaders = new Headers(headers);

  if (sessionToken) {
    requestHeaders.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    credentials: "include",
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return response;
}

async function readErrorMessage(response: Response) {
  const errorBody = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  return errorBody?.error ?? "Request failed";
}
