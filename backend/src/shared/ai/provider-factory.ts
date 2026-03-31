import { aiProvider } from "../config/app-config.ts";
import type { StructuredAiProvider } from "./ai-provider.ts";
import { OpenAiProvider } from "./openai-provider.ts";

let provider: StructuredAiProvider | null = null;

export function getStructuredAiProvider(): StructuredAiProvider {
  if (provider) {
    return provider;
  }

  switch (aiProvider) {
    case "openai":
      provider = new OpenAiProvider();
      return provider;
    default:
      throw new Error(`Unsupported AI provider: ${aiProvider}`);
  }
}
