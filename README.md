# Learning Tracker App (AWS CDK + Lambda + React Native + Python AI Coach)

A minimal, full-stack project showing how learning progress tracker can be built in cloud infrastructure and React Native UI.

This repo demonstrates:

- Infrastructure as Code using **AWS CDK (TypeScript)**
- Serverless backend using **API Gateway + Lambda**
- **DynamoDB** for data storage
- **S3** for file uploads
- **EventBridge + SQS + Worker Lambda** for asynchronous stats computation
- A stubbed **AI Coach service** (planned Python/LLM integration)
- A React Native app folder ready to consume the API

---

## Tech Stack

### Infrastructure / Backend

- **AWS CDK v2 (TypeScript)**
- **AWS Lambda (Node.js 20, bundled via esbuild)**
- **API Gateway (REST API)**
- **DynamoDB (PAY_PER_REQUEST)**
- **S3 (private bucket)**
- **EventBridge + SQS + Worker Lambda**

### Mobile (Frontend)

- **React Native / Expo** (scaffolded in `mobile/`)

### Python (AI / Future Services)

- Planned **AI Coach** service in Python, intended to:
  - run prompt reasoning / recommendations
  - call LLM providers (Bedrock / OpenAI)
  - potentially expose a FastAPI microservice later
- Current AI endpoint is a Lambda stub (`lambdas/ai-coach/handler.ts`)
- Python implementation will live in `python/ai_coach/` (to be added)

---

## Project Structure

learning-tracker-app/
mobile/ # React Native app (later wiring)
infra/ # AWS CDK project
lambdas/ # Lambda source code
resources/
stats/
ai-coach/
python/ # (planned) Python AI services
ai_coach/ # FastAPI / LLM logic (future)

## Architecture Diagram (List)

1. **React Native app** sends HTTPS requests to:
2. **API Gateway (REST)** which routes to:
   - **Resources Lambda**
     - reads/writes **DynamoDB**
     - uploads/downloads files from **S3**
   - **Stats Lambda**
     - reads **DynamoDB**
   - **AI Coach Lambda (stub)**
     - reads **DynamoDB**
     - (future) forwards to **Python AI Coach service**
       - (future) calls **Bedrock / OpenAI**

## Asynchronous Stats Pipeline

1. **Resources Lambda**

   - Writes/updates a resource in DynamoDB.
   - Publishes a `ResourceUpdated` event.

2. **EventBridge**

   - Receives the event.
   - Filters matching events:
     - `source = "learning-tracker.resources"`
     - `detail-type = "ResourceUpdated"`

3. **SQS (StatsQueue)**

   - EventBridge delivers events into SQS.
   - Buffers spikes and retries automatically.

4. **Stats Worker Lambda**

   - Triggered by SQS.
   - Recomputes weekly aggregates:
     - total resources
     - active vs completed
     - hours spent this week
   - Stores stats in DynamoDB:

     `PK = USER#<userId>`  
     `SK = STATS#WEEKLY#<yyyy-WW>`

5. **User experience**
   - Stats update asynchronously without blocking the main API calls.

## API Endpoints

**Base URL** is printed after deploy as **`ApiUrl`**.

Base URL is printed after deploy as `ApiUrl`.

| Method | Route                      | Purpose                             |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/resources`               | List resources for a user           |
| POST   | `/resources`               | Create a new resource               |
| GET    | `/resources/{id}`          | Get one resource                    |
| PATCH  | `/resources/{id}/progress` | Append progress + increment minutes |
| DELETE | `/resources/{id}`          | Delete resource + its progress logs |
| GET    | `/stats`                   | Basic health/stats stub             |
| POST   | `/ai-coach`                | AI coach stub (Python later)        |

---

## Local Setup

## Prerequisites

- **Node.js 18+ or 20+**
- **AWS CLI configured**
- **AWS CDK installed globally**

```bash
npm i -g aws-cdk
aws configure
# Default region: eu-west-2 (London)
# Default region: eu-west-2 (London)
```

## Deploy Infrastructure

From repo root:

```bash
cd infra
npm install
cdk bootstrap aws://YOUR_ACCOUNT_ID/eu-west-2
cdk deploy
```

After deployment, CDK prints:

API URL

DynamoDB table name

S3 bucket name

## Test the API

Replace API_URL with the CDK output:

```bash
API_URL="https://xxxx.execute-api.eu-west-2.amazonaws.com/dev"

curl "$API_URL/resources"
curl -X POST "$API_URL/resources" \
 -H "Content-Type: application/json" \
 -d '{"title":"test"}'

curl "$API_URL/stats"

curl -X POST "$API_URL/ai-coach" \
 -H "Content-Type: application/json" \
 -d '{"prompt":"hi"}'
```

Expected responses are JSON hello-world stubs.

---

````md
## React Native MVP (Expo)

The mobile app (in `mobile/`) supports:

- Login (dev token)
- Resource list
- Add resource
- Update progress modal

### Run mobile app

```bash
cd mobile
npm install
npx expo start
```
````

```md
## Dev Auth (Temporary)

Backend does not enforce real authentication yet.

For MVP:

- The mobile app stores a dev token: `dev-token:<userId>`
- Requests send: `Authorization: Bearer dev-token:<userId>`
- Lambdas read userId from the header when `DEV_AUTH=true`

This will later be replaced by Cognito JWTs without changing the API client.

## Future Work (Python AI Coach)

Planned expansion:

Add python/ai_coach/ FastAPI service

Deploy via Lambda (container) or ECS Fargate

Route /ai-coach to Python service

Integrate LLM reasoning (Bedrock/OpenAI)

Add user-specific recs + progress coaching
```
