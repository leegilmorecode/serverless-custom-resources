import * as AWS from "aws-sdk";

import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";

import { v4 as uuid } from "uuid";

const dynamoDb = new AWS.DynamoDB.DocumentClient();

type Location = {
  id: string;
  name: string;
};

export const listLocationsHandler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const correlationId = uuid();
    const method = "list-locations.handler";
    const prefix = `${correlationId} - ${method}`;

    console.log(`${prefix} - started`);

    const params: AWS.DynamoDB.DocumentClient.ScanInput = {
      TableName: process.env.LOCATIONS_TABLE as string,
      ConsistentRead: false,
    };

    // get the correct records back from dynamodb
    const { Items: data }: AWS.DynamoDB.DocumentClient.ScanOutput =
      await dynamoDb.scan(params).promise();

    if (!data || !data.length) throw new Error("items not found");

    const response: Location[] = data.map((item: any) => ({
      id: item.Id,
      name: item.Name,
    }));

    console.log(`response: ${JSON.stringify(response)}`);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      body: "An error occurred",
    };
  }
};
