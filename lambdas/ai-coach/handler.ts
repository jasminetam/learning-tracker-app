import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("ai-coach event:", JSON.stringify(event));

  const body = event.body ? JSON.parse(event.body) : {};

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello from /ai-coach",
      prompt: body.prompt ?? null,
      hint: "Later this will call Bedrock / OpenAI etc.",
    }),
  };
}
