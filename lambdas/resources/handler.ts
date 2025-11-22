import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("resources event:", JSON.stringify(event));

  const method = event.httpMethod;

  if (method === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Hello from /resources GET",
        table: process.env.RESOURCES_TABLE_NAME,
        bucket: process.env.UPLOADS_BUCKET_NAME,
      }),
    };
  }

  if (method === "POST") {
    const body = event.body ? JSON.parse(event.body) : {};
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Hello from /resources POST",
        received: body,
      }),
    };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
}
