import { ollamaBaseUrl, ollamaModel } from "../config/app-config.ts";
import type {
  StructuredAiProvider,
  StructuredJsonGenerationInput,
} from "./ai-provider.ts";

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

const maxAttempts = 2;

export class OllamaProvider implements StructuredAiProvider {
  async generateJson<T>(input: StructuredJsonGenerationInput): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const content = await requestStructuredOutput(input, attempt);
        return JSON.parse(content) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(
      `Ollama did not return valid structured JSON for ${input.schemaName}: ${
        lastError?.message ?? "unknown error"
      }`,
    );
  }
}

async function requestStructuredOutput(
  input: StructuredJsonGenerationInput,
  attempt: number,
) {
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: input.schema,
      options: {
        temperature: 0,
      },
      messages: [
        {
          role: "system",
          content: [
            input.instructions,
            "Return only valid JSON that exactly matches the provided JSON schema.",
            "Do not include markdown fences or explanatory text.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            input.input,
            "",
            "JSON schema:",
            JSON.stringify(input.schema),
            attempt > 1
              ? "The previous response was not valid JSON. Return only parseable JSON."
              : "",
          ].join("\n"),
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | OllamaChatResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error ??
        `Ollama request failed with status ${response.status}. Is Ollama running at ${ollamaBaseUrl}?`,
    );
  }

  const content = payload?.message?.content?.trim();

  if (!content) {
    throw new Error("Ollama response did not include message content.");
  }

  return content;
}
