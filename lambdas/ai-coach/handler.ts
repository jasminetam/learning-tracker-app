import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const br = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.RESOURCES_TABLE_NAME!;
const MODEL_ID = process.env.BEDROCK_MODEL_ID!; // amazon.titan-text-lite-v1

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : null;
    if (!body) return json(400, { message: "Invalid JSON body" });

    const userId = String(body.userId ?? "dev-user");
    const resources = Array.isArray(body.resources) ? body.resources : [];
    const history = Array.isArray(body.history) ? body.history : [];

    // --- 1) Build prompt ---
    const prompt = buildPrompt(resources, history);

    // --- 2) Call Bedrock (Titan Text Lite) ---
    const raw = await invokeTitan(prompt);

    // --- 3) Parse model response into { suggestions: [...] } ---
    const suggestions = parseSuggestions(raw);

    // --- 4) Store in DynamoDB ---
    const now = new Date().toISOString();
    const item = {
      pk: `USER#${userId}`,
      sk: `SUGGESTIONS#${now}`,
      userId,
      suggestions, // array of { title, type, reason }
      modelId: MODEL_ID,
      createdAt: now,
      entityType: "suggestions",
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

    return json(200, { userId, suggestions });
  } catch (err) {
    console.error("ai suggest error:", err);
    return json(500, { message: "Internal server error" });
  }
}

function buildPrompt(resources: any[], history: any[]) {
  return `
You are an AI study coach.

Given the user's current learning resources and history,
recommend the next 3 resources they should learn.

Return ONLY valid JSON in this format:

{
  "suggestions": [
    { "title": "...", "type": "course|book|video|article", "reason": "..." },
    ...
  ]
}

User resources:
${JSON.stringify(resources, null, 2)}

User history / progress:
${JSON.stringify(history, null, 2)}

Rules:
- Suggestions must be specific and practical.
- Avoid repeating the same resource unless recommending a sequel/advanced follow-up.
- Each reason should be 1–2 sentences.
`;
}

async function invokeTitan(prompt: string): Promise<string> {
  // Titan Text Lite InvokeModel payload uses inputText + textGenerationConfig. :contentReference[oaicite:1]{index=1}
  const payload = {
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: 800,
      temperature: 0.6,
      topP: 0.9,
      stopSequences: [],
    },
  };

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID, // "amazon.titan-text-lite-v1"
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const res = await br.send(cmd);
  const text = new TextDecoder().decode(res.body);

  // Titan response shape: { results: [ { outputText: "..." } ] } :contentReference[oaicite:2]{index=2}
  const parsed = JSON.parse(text);
  const out = parsed?.results?.[0]?.outputText ?? "";
  return out;
}

function parseSuggestions(raw: string) {
  // strict JSON
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.suggestions)) return obj.suggestions;
  } catch {}

  // Fallback: attempt to extract JSON block if model added extra text
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (Array.isArray(obj.suggestions)) return obj.suggestions;
    } catch {}
  }

  // Last resort: return empty suggestions so API doesn't crash
  return [];
}

function json(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
