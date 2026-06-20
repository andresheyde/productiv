import { aiProvider } from "../config/app-config.ts";
import type { StructuredAiProvider } from "./ai-provider.ts";
import { DeterministicAiProvider } from "./deterministic-provider.ts";
import { OllamaProvider } from "./ollama-provider.ts";
import { OpenAiProvider } from "./openai-provider.ts";

let provider: StructuredAiProvider | null = null;

export function getStructuredAiProvider(): StructuredAiProvider {
  if (provider) {
    return provider;
  }

  switch (aiProvider) {
    case "deterministic":
      provider = new DeterministicAiProvider();
      return provider;
    case "ollama":
      provider = new OllamaProvider();
      return provider;
    case "openai":
      provider = new OpenAiProvider();
      return provider;
    default:
      throw new Error(`Unsupported AI provider: ${aiProvider}`);
  }
}

export function resetStructuredAiProviderForTests() {
  provider = null;
}
