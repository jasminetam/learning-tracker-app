import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const eb = new EventBridgeClient({});
const BUS_NAME = process.env.EVENT_BUS_NAME!;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.RESOURCES_TABLE_NAME!;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("resources event:", JSON.stringify(event));

  const method = event.httpMethod;

  if (method === "GET") {
    // stub list for now (real query later)
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Hello from /resources GET",
        table: TABLE,
      }),
    };
  }

  if (method === "POST") {
    const body = event.body ? JSON.parse(event.body) : {};

    const userId = body.userId ?? "dev-user";
    const resourceId = body.resourceId ?? `res_${Date.now()}`;

    const now = new Date().toISOString();

    const item = {
      pk: `USER#${userId}`,
      sk: `RESOURCE#${resourceId}`,
      resourceId,
      title: body.title ?? "untitled",
      status: body.status ?? "active", // "active" | "completed"
      minutesSpent: body.minutesSpent ?? 0, // total minutes so far
      createdAt: now,
      updatedAt: now,
      entityType: "resource",
    };

    // 1) write resource
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
      })
    );

    // 2) publish async stats update event (not blocking user if this fails)
    try {
      await publishResourceUpdated(userId, resourceId);
    } catch (e) {
      console.warn("Failed to publish ResourceUpdated:", e);
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Resource created",
        resource: item,
      }),
    };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
}

async function publishResourceUpdated(userId: string, resourceId: string) {
  const cmd = new PutEventsCommand({
    Entries: [
      {
        EventBusName: BUS_NAME,
        Source: "learning-tracker.resources",
        DetailType: "ResourceUpdated",
        Detail: JSON.stringify({
          userId,
          resourceId,
          happenedAt: new Date().toISOString(),
        }),
      },
    ],
  });

  await eb.send(cmd);
}
