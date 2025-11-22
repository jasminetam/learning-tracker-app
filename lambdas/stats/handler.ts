import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  console.log("stats event:", JSON.stringify(event));

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello from /stats",
      now: new Date().toISOString(),
    }),
  };
}
