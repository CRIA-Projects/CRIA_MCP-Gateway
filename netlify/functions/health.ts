import { createGateway } from "../../src/bootstrap.js";

const app = createGateway();

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  url.pathname = "/health";
  return app.handleRequest(new Request(url, request));
};
