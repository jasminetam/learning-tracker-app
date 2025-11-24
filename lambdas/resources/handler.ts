import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  GetCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.RESOURCES_TABLE_NAME!;

const eb = new EventBridgeClient({});
const BUS_NAME = process.env.EVENT_BUS_NAME!;

// ---------- main handler ----------
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("resources event:", JSON.stringify(event));

  const method = event.httpMethod;
  const path = normalizePath(event.path);

  try {
    // POST /resources
    if (method === "POST" && path === "/resources") {
      return await createResource(event);
    }

    // GET /resources
    if (method === "GET" && path === "/resources") {
      return await listResources(event);
    }

    // GET /resources/{id}
    if (method === "GET" && match(path, "/resources/{id}")) {
      const id = path.split("/")[2];
      return await getResourceById(event, id);
    }

    // DELETE /resources/{id}
    if (method === "DELETE" && match(path, "/resources/{id}")) {
      const id = path.split("/")[2];
      return await deleteResourceById(event, id);
    }

    // PATCH /resources/{id}/progress
    if (method === "PATCH" && match(path, "/resources/{id}/progress")) {
      const id = path.split("/")[2];
      return await addProgress(event, id);
    }

    return json(404, { message: "Not found" });
  } catch (err) {
    console.error("resources error:", err);
    return json(500, { message: "Internal server error" });
  }
}

// ---------- endpoints ----------

async function createResource(event: APIGatewayProxyEvent) {
  const body = parseJson(event.body);
  if (!body) return json(400, { message: "Invalid JSON body" });

  const userId = requireString(body.userId, "userId") ?? "dev-user";
  const title = requireString(body.title, "title");
  if (!title) return json(400, { message: "title is required" });

  const type =
    optionalEnum(body.type, ["course", "book", "video", "article"], "type") ??
    "course";
  const status =
    optionalEnum(body.status, ["active", "completed"], "status") ?? "active";

  const minutesSpent = optionalNumber(body.minutesSpent, "minutesSpent") ?? 0;
  if (minutesSpent < 0)
    return json(400, { message: "minutesSpent must be >= 0" });

  const resourceId =
    (body.resourceId && String(body.resourceId)) || `res_${Date.now()}`;
  const now = new Date().toISOString();

  const item = {
    pk: `USER#${userId}`,
    sk: `RESOURCE#${resourceId}`,
    resourceId,
    title,
    type,
    status,
    minutesSpent,
    createdAt: now,
    updatedAt: now,
    entityType: "resource",
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  await safePublish(userId, resourceId);

  return json(201, { message: "Resource created", resource: item });
}

async function listResources(event: APIGatewayProxyEvent) {
  const userId = event.queryStringParameters?.userId ?? "dev-user";

  const pk = `USER#${userId}`;

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "RESOURCE#",
      },
    })
  );

  return json(200, { userId, resources: res.Items ?? [] });
}

async function getResourceById(
  event: APIGatewayProxyEvent,
  resourceId: string
) {
  const userId = event.queryStringParameters?.userId ?? "dev-user";

  if (!resourceId) return json(400, { message: "Missing resource id" });

  const pk = `USER#${userId}`;
  const sk = `RESOURCE#${resourceId}`;

  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk, sk },
    })
  );

  if (!res.Item) {
    return json(404, { message: "Resource not found" });
  }

  return json(200, { resource: res.Item });
}

async function addProgress(event: APIGatewayProxyEvent, resourceId: string) {
  const body = parseJson(event.body);
  if (!body) return json(400, { message: "Invalid JSON body" });

  const userId = requireString(body.userId, "userId") ?? "dev-user";
  if (!resourceId) return json(400, { message: "Missing resource id" });

  const deltaMinutes = optionalNumber(body.deltaMinutes, "deltaMinutes");
  if (deltaMinutes === null || deltaMinutes <= 0) {
    return json(400, { message: "deltaMinutes must be a positive number" });
  }

  const note = body.note ? String(body.note) : null;
  const now = new Date().toISOString();

  // ensure resource exists first (nice validation)
  const pk = `USER#${userId}`;
  const resourceSk = `RESOURCE#${resourceId}`;

  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk, sk: resourceSk },
    })
  );

  if (!existing.Item) {
    return json(404, { message: "Resource not found" });
  }

  // 1) append progress log
  const progressItem = {
    pk,
    sk: `PROGRESS#${resourceId}#${now}`,
    resourceId,
    deltaMinutes,
    note,
    progressAt: now,
    entityType: "progress",
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: progressItem }));

  // 2) increment total minutes + optional status update
  const status = body.status
    ? optionalEnum(body.status, ["active", "completed"], "status")
    : null;

  const updateParts = [
    "minutesSpent = if_not_exists(minutesSpent, :zero) + :delta",
    "updatedAt = :now",
  ];
  const exprValues: Record<string, any> = {
    ":delta": deltaMinutes,
    ":zero": 0,
    ":now": now,
  };

  if (status) {
    updateParts.push("status = :status");
    exprValues[":status"] = status;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk, sk: resourceSk },
      UpdateExpression: "SET " + updateParts.join(", "),
      ExpressionAttributeValues: exprValues,
    })
  );

  await safePublish(userId, resourceId);

  return json(200, { message: "Progress added", resourceId, deltaMinutes });
}

async function deleteResourceById(
  event: APIGatewayProxyEvent,
  resourceId: string
) {
  const userId = event.queryStringParameters?.userId ?? "dev-user";

  if (!resourceId) return json(400, { message: "Missing resource id" });

  const pk = `USER#${userId}`;
  const resourceSk = `RESOURCE#${resourceId}`;

  // 1) delete the resource item
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk, sk: resourceSk },
    })
  );

  // 2) delete all progress logs for this resource (best effort)
  const progressRes = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :pfx)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":pfx": `PROGRESS#${resourceId}#`,
      },
      ProjectionExpression: "pk, sk",
    })
  );

  const progressKeys = (progressRes.Items ?? []).map((i) => ({
    pk: i.pk,
    sk: i.sk,
  }));

  // batch delete in chunks of 25
  for (let i = 0; i < progressKeys.length; i += 25) {
    const chunk = progressKeys.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: chunk.map((key) => ({
            DeleteRequest: { Key: key },
          })),
        },
      })
    );
  }

  await safePublish(userId, resourceId);

  return json(200, {
    message: "Resource deleted",
    resourceId,
    deletedProgress: progressKeys.length,
  });
}

// ---------- helpers ----------

function json(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseJson(raw?: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireString(v: any, field: string): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function optionalNumber(v: any, field: string): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optionalEnum(v: any, allowed: string[], field: string): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return allowed.includes(s) ? s : null;
}

function normalizePath(p: string) {
  // remove trailing slash except root
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function match(
  actual: string,
  pattern: "/resources/{id}" | "/resources/{id}/progress"
) {
  if (pattern === "/resources/{id}") {
    return /^\/resources\/[^/]+$/.test(actual);
  }
  if (pattern === "/resources/{id}/progress") {
    return /^\/resources\/[^/]+\/progress$/.test(actual);
  }
  return false;
}

async function safePublish(userId: string, resourceId: string) {
  try {
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
  } catch (e) {
    console.warn("publish ResourceUpdated failed:", e);
  }
}
