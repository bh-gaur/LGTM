const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Node.js Hapi.js App API",
    version: "1.0.0",
    description: "API Documentation for Node.js Hapi.js App in LGTM Stack"
  },
  paths: {
    "/": {
      get: {
        summary: "Root / Web UI Dashboard",
        responses: { "200": { description: "Success" } }
      }
    },
    "/calculate/{num}": {
      get: {
        summary: "Calculate Fibonacci & Downstream Analysis",
        parameters: [
          {
            name: "num",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Number to calculate Fibonacci for"
          }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/math/prime-factors/{n}": {
      get: {
        summary: "Prime Factorization (Python Proxy)",
        parameters: [
          {
            name: "n",
            in: "path",
            required: true,
            schema: { type: "integer" }
          }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/text/analyze": {
      post: {
        summary: "Text Sentiment & Metrics (Python Proxy)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { text: { type: "string" } }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/data/aggregate": {
      post: {
        summary: "Array Aggregation (Python Proxy)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  values: { type: "array", items: { type: "number" } }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/system/status": {
      get: {
        summary: "System Diagnostics & Telemetry (Python Proxy)",
        responses: { "200": { description: "Success" } }
      }
    },
    "/complex-task": {
      get: {
        summary: "Run Nested Complex Task",
        responses: { "200": { description: "Success" } }
      }
    },
    "/multi-step/{id}": {
      get: {
        summary: "Run Sequential Steps",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Flow identifier"
          }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/user/{id}": {
      get: {
        summary: "Simulate User Lookup",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "User ID"
          }
        ],
        responses: {
          "200": { description: "Success" },
          "404": { description: "User Not Found" }
        }
      }
    },
    "/error": {
      get: {
        summary: "Simulate 500 Error",
        responses: { "500": { description: "Error" } }
      }
    },
    "/metrics": {
      get: {
        summary: "Expose Prometheus Metrics",
        responses: { "200": { description: "Success" } }
      }
    }
  }
};

const swaggerUiHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Node.js App API Docs</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-themes@1.4.3/themes/dark.min.css" />
    <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5/favicon-32x32.png" sizes="32x32" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #1b1b1b; font-family: sans-serif; }
      .swagger-ui .topbar { background-color: #111111; border-bottom: 2px solid #333333; }
      .swagger-ui .info .title { color: #ffffff !important; }
      .swagger-ui { background-color: #1b1b1b; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: "/swagger.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        });
        window.ui = ui;
      };
    </script>
  </body>
  </html>
`;

module.exports = {
  swaggerDocument,
  swaggerUiHtml
};
