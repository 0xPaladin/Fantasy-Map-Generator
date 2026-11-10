import { afterEach, describe, expect, it, vi } from "vitest";
import { filterChatModels, listModels } from "./models";

const globals = globalThis as Record<string, unknown>;

function stubFetch(ids: string[]): ReturnType<typeof vi.fn> {
  const payload = { data: ids.map(id => ({ id })) };
  const fetchStub = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
  globals.fetch = fetchStub;
  return fetchStub;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("filterChatModels", () => {
  it("keeps chat models and drops audio, image and embedding variants for OpenAI", () => {
    const ids = ["gpt-6-luna", "gpt-6-astra", "gpt-audio", "text-embedding-3-small", "whisper-1", "o4-mini"];
    expect(filterChatModels("openai", ids)).toEqual(["gpt-6-luna", "o4-mini"]);
  });

  it("drops embeddings, moderation and OCR models for Mistral", () => {
    const ids = [
      "mistral-small-latest",
      "mistral-embed",
      "codestral-latest",
      "mistral-moderation-latest",
      "mistral-ocr-latest"
    ];
    expect(filterChatModels("mistral", ids)).toEqual(["mistral-small-latest", "codestral-latest"]);
  });

  it("keeps everything for local servers", () => {
    expect(filterChatModels("local", ["llama3.2", "qwen2.5-coder:7b"])).toEqual(["llama3.2", "qwen2.5-coder:7b"]);
  });

  it("keeps only GLM models for Z.ai", () => {
    expect(filterChatModels("zai", ["glm-4.6", "glm-4.5-air", "embedding-3", "chargebee"])).toEqual([
      "glm-4.6",
      "glm-4.5-air"
    ]);
  });
});

describe("listModels", () => {
  it("discovers Gemini chat models with the user's key and excludes specialized models", async () => {
    const fetchStub = stubFetch([
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
      "gemini-embedding-001",
      "gemini-2.5-flash-image",
      "gemini-2.5-flash-native-audio-latest",
      "gemini-2.5-flash-preview-tts",
      "gemini-live-2.5-flash-preview",
      "gemini-robotics-er-1.5-preview",
      "gemini-2.5-computer-use-preview-10-2025",
      "imagen-4.0-generate-001",
      "veo-3.0-generate-001",
      "gemma-3-27b-it"
    ]);
    const signal = new AbortController().signal;
    expect(await listModels("gemini", "gemini-key", "", signal)).toEqual([
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview"
    ]);
    expect(fetchStub.mock.calls[0]).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/openai/models",
      { headers: { Authorization: "Bearer gemini-key" }, signal }
    ]);
  });

  it("shows the provider's discovery error", async () => {
    globals.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 })
    );
    await expect(listModels("openai", "wrong")).rejects.toThrow("Invalid API key");
  });

  it("fetches an OpenAI-compatible models endpoint with the bearer key", async () => {
    const fetchStub = stubFetch(["mistral-small-latest", "mistral-embed"]);
    const models = await listModels("mistral", "sk-m");

    const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/models");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer sk-m");
    expect(models).toEqual(["mistral-small-latest"]);
  });

  it("fetches Anthropic's models endpoint with its native headers", async () => {
    const fetchStub = stubFetch(["claude-sonnet-5", "claude-haiku-4-5"]);
    const models = await listModels("anthropic", "sk-a");

    const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    const headers = options.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-a");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(models).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
  });

  it("asks the given local server without an auth header", async () => {
    const fetchStub = stubFetch(["llama3.2"]);
    const models = await listModels("local", "", "http://localhost:8080/v1/");

    const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/v1/models");
    expect("Authorization" in ((options.headers ?? {}) as Record<string, string>)).toBe(false);
    expect(models).toEqual(["llama3.2"]);
  });

  it("defaults the local server to Ollama's endpoint", async () => {
    const fetchStub = stubFetch(["llama3.2"]);
    await listModels("local", "");
    expect(fetchStub.mock.calls[0][0]).toBe("http://localhost:11434/v1/models");
  });

  it("reads Qwen's paginated model catalog", async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output: { total: 2, models: [{ model: "qwen3.8-flash" }] } }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output: { total: 2, models: [{ model: "qwen3.7-plus" }] } }))
      );
    globals.fetch = fetchStub;

    expect(await listModels("qwen", "sk-q")).toEqual(["qwen3.8-flash", "qwen3.7-plus"]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/models?providers=qwen&features=function-calling");
    expect(fetchStub.mock.calls[1][0]).toContain("page_no=2");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer sk-q");
  });

  it("filters OpenRouter's catalog to tool-calling text models", async () => {
    const catalog = {
      data: [
        {
          id: "anthropic/claude-sonnet-4.5",
          architecture: { output_modalities: ["text"] },
          supported_parameters: ["tools", "temperature"]
        },
        {
          id: "z-ai/glm-4.6",
          architecture: { output_modalities: ["text"] },
          supported_parameters: ["tools"]
        },
        {
          id: "openai/gpt-5",
          architecture: { output_modalities: ["text", "image"] },
          supported_parameters: ["tools"]
        },
        { id: "vendor/embeddings", architecture: { output_modalities: ["text"] }, supported_parameters: [] },
        {
          id: "vendor/image-gen",
          architecture: { output_modalities: ["image"] },
          supported_parameters: ["tools"]
        },
        {
          id: "anthropic/claude-sonnet-4.5:batch",
          architecture: { output_modalities: ["text"] },
          supported_parameters: ["tools"]
        },
        {
          id: "vendor/web-search:online",
          architecture: { output_modalities: ["text"] },
          supported_parameters: ["tools"]
        },
        {
          id: "deepseek/deepseek-chat:free",
          architecture: { output_modalities: ["text"] },
          supported_parameters: ["tools"]
        }
      ]
    };
    const fetchStub = vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 }));
    globals.fetch = fetchStub;

    globals.fetch = fetchStub;
    const globals2 = globalThis as Record<string, unknown>;
    globals2.location = { origin: "https://example.com" };

    try {
      expect(await listModels("openrouter", "sk-o")).toEqual([
        "anthropic/claude-sonnet-4.5",
        "z-ai/glm-4.6",
        "openai/gpt-5",
        "deepseek/deepseek-chat:free"
      ]);
      const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://openrouter.ai/api/v1/models");
      const headers = options.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-o");
      expect(headers["HTTP-Referer"]).toBe("https://example.com");
    } finally {
      delete globals2.location;
    }
  });

  it("uses Z.ai's OpenAI-compatible models endpoint with the bearer key", async () => {
    const fetchStub = stubFetch(["glm-4.6", "glm-4.5-air", "embedding-3"]);
    const models = await listModels("zai", "sk-z");

    const [url, options] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.z.ai/api/paas/v4/models");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer sk-z");
    expect(models).toEqual(["glm-4.6", "glm-4.5-air"]);
  });
});
