import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as cr from "aws-cdk-lib/custom-resources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";

import { CustomResource, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";

import { Construct } from "constructs";

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // create the locations database
    const locationsTable: dynamodb.Table = new dynamodb.Table(
      this,
      "LocationsTable",
      {
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        pointInTimeRecovery: false,
        tableName: "Locations",
        contributorInsightsEnabled: true,
        removalPolicy: RemovalPolicy.DESTROY,
        partitionKey: {
          name: "Id",
          type: dynamodb.AttributeType.STRING,
        },
      }
    );

    // create the lambda handler to list the coffee shop locations
    const listLocationsHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "ListLocationsHandler", {
        functionName: "list-locations-handler",
        runtime: lambda.Runtime.NODEJS_14_X,
        entry: path.join(__dirname, "/../src/list-locations/list-locations.ts"),
        memorySize: 1024,
        handler: "listLocationsHandler",
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          LOCATIONS_TABLE: locationsTable.tableName,
        },
      });

    // create the lambda for our custom resource
    const populateLocationsHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "PopulateLocationsHandler", {
        functionName: "populate-locations-handler",
        runtime: lambda.Runtime.NODEJS_14_X,
        entry: path.join(
          __dirname,
          "/../src/populate-locations/populate-locations.ts"
        ),
        memorySize: 1024,
        handler: "populateLocationsHandler",
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
      });

    // add the permissions for the lambda to access dynamodb table
    locationsTable.grantReadData(listLocationsHandler);
    locationsTable.grantWriteData(populateLocationsHandler);

    // create the api for the locations
    const locationsAPI: apigw.RestApi = new apigw.RestApi(
      this,
      "LocationsApi",
      {
        description: "locations api",
        restApiName: "locations-api",
        deploy: true,
        deployOptions: {
          stageName: "prod",
          dataTraceEnabled: true,
          loggingLevel: apigw.MethodLoggingLevel.INFO,
          tracingEnabled: true,
          metricsEnabled: true,
        },
      }
    );

    const locations: apigw.Resource =
      locationsAPI.root.addResource("locations");

    locations.addMethod(
      "GET",
      new apigw.LambdaIntegration(listLocationsHandler, {
        proxy: true,
        allowTestInvoke: true,
      })
    );

    // create the custom resource
    const provider: cr.Provider = new cr.Provider(
      this,
      "PopulateTableCustomResource",
      {
        onEventHandler: populateLocationsHandler, // this lambda will be called on cfn deploy
        logRetention: logs.RetentionDays.ONE_DAY,
        providerFunctionName: "populate-locations-lambda",
      }
    );

    // use the custom resource provider
    new CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      properties: {
        tableName: locationsTable.tableName,
      },
    });
  }
}
