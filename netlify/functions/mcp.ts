import { createGateway } from "../../src/bootstrap.js";

const app = createGateway();

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const functionPrefix = "/.netlify/functions/mcp";
  if (url.pathname.startsWith(functionPrefix)) {
    const internalPath = url.pathname.slice(functionPrefix.length);
    url.pathname = internalPath === "/admin/config" ? internalPath : `/mcp${internalPath}`;
  }
  return app.handleRequest(new Request(url, request));
};
