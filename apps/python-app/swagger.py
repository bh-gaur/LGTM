SWAGGER_DOCUMENT = {
    "openapi": "3.0.0",
    "info": {
        "title": "Python Flask App API",
        "version": "1.0.0",
        "description": "API Documentation for Python Flask App in LGTM Stack"
    },
    "paths": {
        "/": {
            "get": {
                "summary": "Root / Index",
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/data": {
            "get": {
                "summary": "Retrieve Sum Calculation",
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/analyze": {
            "post": {
                "summary": "Analyze Number Properties",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "number": { "type": "integer" },
                                    "type": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/heavy-analysis": {
            "post": {
                "summary": "Heavy Compute Simulation",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "dataset_id": { "type": "integer" },
                                    "tasks": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/math/prime-factors/{n}": {
            "get": {
                "summary": "Prime Factorization",
                "parameters": [
                    {
                        "name": "n",
                        "in": "path",
                        "required": True,
                        "schema": { "type": "integer" },
                        "description": "Integer to factorize"
                    }
                ],
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/text/analyze": {
            "post": {
                "summary": "Text Sentiment & Metrics",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "text": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/data/aggregate": {
            "post": {
                "summary": "Data Array Aggregation",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "values": { "type": "array", "items": { "type": "number" } }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/system/status": {
            "get": {
                "summary": "System Diagnostics & Telemetry",
                "responses": { "200": { "description": "Success" } }
            }
        },
        "/faulty-endpoint": {
            "get": {
                "summary": "Faulty Database write simulation",
                "responses": { "500": { "description": "Internal Server Error" } }
            }
        },
        "/db/user/{user_id}": {
            "get": {
                "summary": "Query user details",
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": True,
                        "schema": { "type": "string" },
                        "description": "The user ID to fetch"
                    }
                ],
                "responses": {
                    "200": { "description": "Success" },
                    "404": { "description": "User Not Found" }
                }
            }
        }
    }
}

SWAGGER_UI_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Python App API Docs</title>
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
"""
