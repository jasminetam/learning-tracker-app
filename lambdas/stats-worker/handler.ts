import { SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.RESOURCES_TABLE_NAME!;

function getIsoWeekKey(d = new Date()) {
  // ISO week-ish key, for weekly grouping
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  const year = date.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

export const handler: SQSHandler = async (event) => {
  console.log("stats-worker batch size:", event.Records.length);

  // Collect unique userIds from the batch
  const userIds = new Set<string>();

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const detail = body.detail ?? {}; // EventBridge puts 'detail' here
      if (detail.userId) userIds.add(detail.userId);
    } catch (e) {
      console.warn("bad record:", record.body);
    }
  }

  for (const userId of userIds) {
    await recomputeWeeklyStats(userId);
  }
};

async function recomputeWeeklyStats(userId: string) {
  console.log("recomputing stats for user:", userId);

  // 1) Query all resources for this user
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

  const items = res.Items ?? [];

  // 2) Compute aggregates
  const totalResources = items.length;
  const active = items.filter((i) => i.status === "active").length;
  const completed = items.filter((i) => i.status === "completed").length;

  const weekKey = getIsoWeekKey(new Date());

  const weekStart = startOfIsoWeek(new Date());
  const minutesThisWeek = items.reduce((sum, i) => {
    const updatedAt = i.updatedAt ? new Date(i.updatedAt) : null;
    if (!updatedAt || updatedAt < weekStart) return sum;
    return sum + (i.minutesSpent ?? 0);
  }, 0);

  const hoursSpentThisWeek = Math.round((minutesThisWeek / 60) * 10) / 10;

  // 3) Store stats item
  const statsSk = `STATS#WEEKLY#${weekKey}`;

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk,
        sk: statsSk,
        totalResources,
        active,
        completed,
        hoursSpentThisWeek,
        weekKey,
        updatedAt: new Date().toISOString(),
        entityType: "weekly_stats",
      },
    })
  );

  console.log("stored weekly stats:", { pk, statsSk });
}

function startOfIsoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
