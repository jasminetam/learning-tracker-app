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
        },
      });

    // --- Lambdas ---
    const resourcesFn = mkLambda("ResourcesFn", "lambdas/resources/handler.ts");
    const statsFn = mkLambda("StatsFn", "lambdas/stats/handler.ts");
    const aiCoachFn = mkLambda("AiCoachFn", "lambdas/ai-coach/handler.ts");

    // Permissions
    resourcesTable.grantReadWriteData(resourcesFn);
    resourcesTable.grantReadData(statsFn); // stats usually only reads
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

    // /stats
    const stats = api.root.addResource("stats");
    stats.addMethod("GET", new apigw.LambdaIntegration(statsFn));

    // /ai-coach
    const aiCoach = api.root.addResource("ai-coach");
    aiCoach.addMethod("POST", new apigw.LambdaIntegration(aiCoachFn));

    // Outputs
    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "ResourcesTableName", {
      value: resourcesTable.tableName,
    });
    new CfnOutput(this, "UploadsBucketName", {
      value: uploadsBucket.bucketName,
    });
  }
}
