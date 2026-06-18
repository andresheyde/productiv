export function getSessionTokenFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("sessionToken");
  } catch {
    return null;
  }
}
