import "server-only";

export class AiConfigurationError extends Error {
  constructor() {
    super("AI 尚未配置。请在服务端设置千问 API 连接信息。");
    this.name = "AiConfigurationError";
  }
}

export interface AiConfiguration {
  provider: "qwen";
  model: string;
  baseUrl: string;
  apiKey: string;
}

export function getAiConfiguration(): AiConfiguration {
  const provider = process.env.AI_PROVIDER?.trim();
  const model = process.env.AI_MODEL?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();

  if (provider !== "qwen" || !model || !baseUrl || !apiKey) {
    throw new AiConfigurationError();
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AiConfigurationError();
  }
  if (url.protocol !== "https:") throw new AiConfigurationError();
  return {
    provider,
    model,
    baseUrl: url.toString().replace(/\/$/, ""),
    apiKey,
  };
}
