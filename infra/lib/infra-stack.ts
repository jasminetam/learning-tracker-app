import * as path from "path";
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as eventbridge from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";

export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- DynamoDB ---
    const resourcesTable = new dynamodb.Table(this, "ResourcesTable", {
      tableName: "learning-tracker-resources",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // dev-friendly
    });

    // --- S3 ---
    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: `learning-tracker-uploads-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY, // dev-friendly
      autoDeleteObjects: true, // dev-friendly
    });

    // --- EventBridge Bus ---
    const bus = new eventbridge.EventBus(this, "LearningTrackerBus", {
      eventBusName: "learning-tracker-bus",
    });

    // Helper to create Nodejs lambdas
    const mkLambda = (name: string, entryRelPath: string) =>
      new NodejsFunction(this, name, {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "..", "..", entryRelPath),
        handler: "handler",
        memorySize: 256,
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: true,
          target: "es2020",
        },
        environment: {
          RESOURCES_TABLE_NAME: resourcesTable.tableName,
          UPLOADS_BUCKET_NAME: uploadsBucket.bucketName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
          // expose bus name in every lambda by default
          EVENT_BUS_NAME: bus.eventBusName,
        },
      });

    // --- Lambdas ---
    const resourcesFn = mkLambda("ResourcesFn", "lambdas/resources/handler.ts");
    const statsFn = mkLambda("StatsFn", "lambdas/stats/handler.ts");
    const aiCoachFn = mkLambda("AiCoachFn", "lambdas/ai-coach/handler.ts");

    // DEV auth flag (lets backend read dev userId from Bearer token)
    resourcesFn.addEnvironment("DEV_AUTH", "true");
    aiCoachFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"], // MVP; later restrict to specific model ARN
      })
    );
    aiCoachFn.addEnvironment("BEDROCK_MODEL_ID", "amazon.titan-text-lite-v1");

    // Permissions
    resourcesTable.grantReadWriteData(resourcesFn);
    resourcesTable.grantReadData(statsFn);
    resourcesTable.grantReadData(aiCoachFn);

    uploadsBucket.grantReadWrite(resourcesFn);
    uploadsBucket.grantRead(aiCoachFn);

    // --- API Gateway (REST) ---
    const api = new apigw.RestApi(this, "LearningTrackerApi", {
      restApiName: "learning-tracker-api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // /resources
    const resources = api.root.addResource("resources");
    resources.addMethod("GET", new apigw.LambdaIntegration(resourcesFn));
    resources.addMethod("POST", new apigw.LambdaIntegration(resourcesFn));

    // /resources/{id}
    const resourceById = resources.addResource("{id}");
    resourceById.addMethod("GET", new apigw.LambdaIntegration(resourcesFn));
    resourceById.addMethod("DELETE", new apigw.LambdaIntegration(resourcesFn));

    // /resources/{id}/progress
    const progress = resourceById.addResource("progress");
    progress.addMethod("PATCH", new apigw.LambdaIntegration(resourcesFn));

    // /stats
    const stats = api.root.addResource("stats");
    stats.addMethod("GET", new apigw.LambdaIntegration(statsFn));

    // /ai
    const ai = api.root.addResource("ai");

    // /ai/suggest-next
    const suggestNext = ai.addResource("suggest-next");
    suggestNext.addMethod("POST", new apigw.LambdaIntegration(aiCoachFn));

    // --- SQS queue for stats recompute ---
    const statsQueue = new sqs.Queue(this, "StatsQueue", {
      queueName: "learning-tracker-stats-queue",
      visibilityTimeout: Duration.seconds(60),
      retentionPeriod: Duration.days(4),
    });

    // --- Worker Lambda ---
    const statsWorkerFn = mkLambda(
      "StatsWorkerFn",
      "lambdas/stats-worker/handler.ts"
    );

    // DEV auth flag for worker
    statsWorkerFn.addEnvironment("DEV_AUTH", "true");

    // Permissions for worker
    resourcesTable.grantReadData(statsWorkerFn);
    resourcesTable.grantReadWriteData(statsWorkerFn);
    statsQueue.grantConsumeMessages(statsWorkerFn);

    // Allow resources lambda to publish events
    bus.grantPutEventsTo(resourcesFn);

    // Wire SQS → worker
    statsWorkerFn.addEventSource(
      new lambdaEventSources.SqsEventSource(statsQueue, {
        batchSize: 5,
        maxBatchingWindow: Duration.seconds(5),
      })
    );

    // EventBridge rule: ResourceUpdated → SQS
    new eventbridge.Rule(this, "ResourceUpdatedRule", {
      eventBus: bus,
      eventPattern: {
        source: ["learning-tracker.resources"],
        detailType: ["ResourceUpdated"],
      },
      targets: [new targets.SqsQueue(statsQueue)],
    });

    // Outputs
    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "ResourcesTableName", {
      value: resourcesTable.tableName,
    });
    new CfnOutput(this, "UploadsBucketName", {
      value: uploadsBucket.bucketName,
    });
    new CfnOutput(this, "EventBusName", {
      value: bus.eventBusName,
    });
    new CfnOutput(this, "StatsQueueUrl", {
      value: statsQueue.queueUrl,
    });
  }
}
