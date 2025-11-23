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

## API Endpoints

**Base URL** is printed after deploy as **`ApiUrl`**.

## Endpoints

| Method | Route        | Lambda        | Purpose                         |
| ------ | ------------ | ------------- | ------------------------------- |
| `GET`  | `/resources` | `resourcesFn` | Hello / list resources (stub)   |
| `POST` | `/resources` | `resourcesFn` | Create resource (stub)          |
| `GET`  | `/stats`     | `statsFn`     | Basic stats / health check      |
| `POST` | `/ai-coach`  | `aiCoachFn`   | AI Coach stub; Python/LLM later |

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

## Future Work (Python AI Coach)

Planned expansion:

Add python/ai_coach/ FastAPI service

Deploy via Lambda (container) or ECS Fargate

Route /ai-coach to Python service

Integrate LLM reasoning (Bedrock/OpenAI)

Add user-specific recs + progress coaching
