import {
  openAiApiBaseUrl,
  openAiApiKey,
  openAiModel,
} from "../config/app-config.ts";
import type {
  StructuredAiProvider,
  StructuredJsonGenerationInput,
} from "./ai-provider.ts";

interface OpenAiResponsesApiOutputText {
  type?: string;
  text?: string;
}

interface OpenAiResponsesApiOutputMessage {
  type?: string;
  content?: OpenAiResponsesApiOutputText[];
}

interface OpenAiResponsesApiResponse {
  error?: {
    message?: string;
  } | null;
  output?: OpenAiResponsesApiOutputMessage[];
}

export class OpenAiProvider implements StructuredAiProvider {
  async generateJson<T>(input: StructuredJsonGenerationInput): Promise<T> {
    if (!openAiApiKey || !openAiModel) {
      throw new Error(
        "AI provider is not configured. Set OPENAI_API_KEY and OPENAI_MODEL.",
      );
    }

    const response = await fetch(`${openAiApiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions: input.instructions,
        input: input.input,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            schema: input.schema,
            strict: true,
          },
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | OpenAiResponsesApiResponse
      | null;

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? "OpenAI request failed unexpectedly.",
      );
    }

    const outputText = extractOutputText(payload);

    if (!outputText) {
      throw new Error("OpenAI response did not include structured output text.");
    }

    return JSON.parse(outputText) as T;
  }
}

function extractOutputText(
  payload: OpenAiResponsesApiResponse | null,
): string | null {
  const firstMessage = payload?.output?.find((item) => item.type === "message");
  const firstText = firstMessage?.content?.find(
    (item) => item.type === "output_text" && typeof item.text === "string",
  );

  return firstText?.text ?? null;
}
