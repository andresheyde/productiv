import { googleIntegrationProvider } from "../config/app-config.ts";
import type { GoogleIntegrationProvider } from "./google-integration-provider.ts";
import { LocalGoogleIntegrationProvider } from "./local-google-integration-provider.ts";
import { RealGoogleIntegrationProvider } from "./real-google-integration-provider.ts";

let provider: GoogleIntegrationProvider | null = null;

export function getGoogleIntegrationProvider(): GoogleIntegrationProvider {
  if (provider) {
    return provider;
  }

  switch (googleIntegrationProvider) {
    case "google":
      provider = new RealGoogleIntegrationProvider();
      return provider;
    case "local":
      provider = new LocalGoogleIntegrationProvider();
      return provider;
    default:
      throw new Error(
        `Unsupported Google integration provider: ${googleIntegrationProvider}`,
      );
  }
}

export function resetGoogleIntegrationProviderForTests() {
  provider = null;
}
