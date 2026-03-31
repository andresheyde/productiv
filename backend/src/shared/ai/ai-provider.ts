export interface StructuredJsonGenerationInput {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface StructuredAiProvider {
  generateJson<T>(input: StructuredJsonGenerationInput): Promise<T>;
}
