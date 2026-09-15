import { httpServerHandler } from "cloudflare:node";

import app from "../../../server/app.js";
import { runWithRuntimeContext } from "../../../server/runtimeContext.js";

app.listen(3000);

const nodeHandler = httpServerHandler({ port: 3000 });
const nodeFetch = nodeHandler.fetch;

if (!nodeFetch) {
  throw new Error("Cloudflare Node HTTP handler does not expose fetch()");
}

export default {
  ...nodeHandler,

  async fetch(request, env, ctx): Promise<Response> {
    return runWithRuntimeContext(env, async () => {
      const response = await nodeFetch(request, env, ctx);
      const url = new URL(request.url);

      // Keep PDF responses streamable wherever possible. Only add a content
      // length when the existing handler already buffered the response.
      if (
        url.pathname === "/api/file" &&
        response.headers.get("content-type")?.toLowerCase() === "application/pdf" &&
        !response.headers.has("content-length")
      ) {
        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set("Content-Length", String(body.byteLength));

        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    });
  },
} satisfies ExportedHandler<Env>;
