const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Optikon API",
    description: `
## Overview
Optikon is a collaborative whiteboard/canvas application. This API allows external applications to create and manage boards, workspaces, and board elements.

## Authentication

### NIP-98 HTTP Auth (Recommended for API Access)
Optikon supports [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP authentication, allowing Nostr-native applications to authenticate using signed events.

#### How it works:
1. Create a Nostr event with kind \`27235\`
2. Include the request URL in a \`u\` tag
3. Include the HTTP method in a \`method\` tag
4. Sign the event with your Nostr private key
5. Base64-encode the JSON event
6. Send in the \`Authorization\` header as \`Nostr <base64-event>\`

#### Event Structure:
\`\`\`json
{
  "kind": 27235,
  "created_at": <unix-timestamp>,
  "tags": [
    ["u", "https://optikon.otherstuff.ai/boards"],
    ["method", "POST"]
  ],
  "content": "",
  "pubkey": "<your-hex-pubkey>",
  "id": "<event-id>",
  "sig": "<signature>"
}
\`\`\`

#### Example Authorization Header:
\`\`\`
Authorization: Nostr eyJraW5kIjoyNzIzNSwiY3JlYXRlZF9hdCI6MTcwNjUwMDAwMCwidGFncyI6W1sidSIsImh0dHBzOi8vb3B0aWtvbi5vdGhlcnN0dWZmLmFpL2JvYXJkcyJdLFsibWV0aG9kIiwiUE9TVCJdXSwiY29udGVudCI6IiIsInB1YmtleSI6ImFiYzEyMy4uLiIsImlkIjoiLi4uIiwic2lnIjoiLi4uIn0=
\`\`\`

#### Validation Rules:
- Event signature must be valid
- \`created_at\` must be within 60 seconds of server time
- URL in \`u\` tag must match the request URL exactly
- Method in \`method\` tag must match the HTTP method
- Pubkey must be in the server's whitelist (if configured)

#### TypeScript Example:
\`\`\`typescript
import { finalizeEvent } from 'nostr-tools/pure';

function createNip98Auth(url: string, method: string, secretKey: Uint8Array): string {
  const event = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['u', url], ['method', method]],
    content: '',
  }, secretKey);
  return 'Nostr ' + btoa(JSON.stringify(event));
}
\`\`\`

### Cookie-Based Session Auth
For browser-based access, Optikon also supports cookie-based sessions via the \`/auth/login\` endpoint.

## Access Control
- **Workspaces**: Organizational containers for boards
- **Boards**: Can be public or private
- **Roles**: \`viewer\`, \`commenter\`, \`editor\`
- Board owners have full control including privacy settings
`,
    version: "1.0.0",
    contact: {
      name: "Optikon API",
    },
  },
  servers: [
    {
      url: "https://optikon.otherstuff.ai",
      description: "Production server",
    },
    {
      url: "http://localhost:3025",
      description: "Local development",
    },
  ],
  tags: [
    { name: "Authentication", description: "Login and session management" },
    { name: "Workspaces", description: "Workspace management" },
    { name: "Boards", description: "Board CRUD operations" },
    { name: "Board Elements", description: "Canvas elements (shapes, text, etc.)" },
    { name: "Board Members", description: "Board sharing and permissions" },
  ],
  components: {
    securitySchemes: {
      nip98: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Nostr NIP-98",
        description: "NIP-98 signed Nostr event, base64-encoded. Header format: `Authorization: Nostr <base64-event>`",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "nostr_session",
        description: "Session cookie from /auth/login",
      },
    },
    schemas: {
      Board: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Board ID" },
          title: { type: "string", description: "Board title" },
          description: { type: "string", nullable: true, description: "Board description" },
          owner_pubkey: { type: "string", nullable: true, description: "Owner's hex pubkey" },
          owner_npub: { type: "string", nullable: true, description: "Owner's npub" },
          workspace_id: { type: "integer", nullable: true, description: "Parent workspace ID" },
          is_private: { type: "integer", enum: [0, 1], description: "0=public, 1=private" },
          default_role: { type: "string", enum: ["viewer", "commenter", "editor"] },
          starred: { type: "integer", enum: [0, 1] },
          archived_at: { type: "string", nullable: true, format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Workspace: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          owner_pubkey: { type: "string", nullable: true },
          owner_npub: { type: "string", nullable: true },
          is_personal: { type: "integer", enum: [0, 1] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      BoardElement: {
        type: "object",
        properties: {
          id: { type: "string", description: "Element UUID" },
          type: {
            type: "string",
            enum: ["sticky", "text", "rectangle", "ellipse", "frame", "line", "image", "comment", "freedraw"],
          },
          x: { type: "number", description: "X position on canvas" },
          y: { type: "number", description: "Y position on canvas" },
        },
        additionalProperties: true,
        description: "Element properties vary by type. Common fields: id, type, x, y",
      },
      CreateBoardRequest: {
        type: "object",
        properties: {
          title: { type: "string", description: "Board title (defaults to 'Untitled Board')" },
          description: { type: "string", description: "Optional description" },
          workspaceId: { type: "integer", description: "Workspace ID (auto-creates personal workspace if omitted)" },
          isPrivate: { type: "boolean", description: "Whether board is private (default: false)" },
        },
      },
      Error: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/workspaces": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspaces",
        description: "Get all workspaces the authenticated user has access to",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        responses: {
          "200": {
            description: "List of workspaces",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Workspace" },
                },
              },
            },
          },
          "401": { description: "Not authenticated" },
        },
      },
      post: {
        tags: ["Workspaces"],
        summary: "Create workspace",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                },
                required: ["title"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Workspace created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Workspace" },
              },
            },
          },
          "401": { description: "Not authenticated" },
        },
      },
    },
    "/boards": {
      get: {
        tags: ["Boards"],
        summary: "List boards",
        description: "Get all boards accessible to the authenticated user",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "workspace_id",
            in: "query",
            schema: { type: "integer" },
            description: "Filter by workspace ID",
          },
        ],
        responses: {
          "200": {
            description: "List of boards",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Board" },
                },
              },
            },
          },
          "401": { description: "Not authenticated" },
        },
      },
      post: {
        tags: ["Boards"],
        summary: "Create board",
        description: "Create a new board. If workspaceId is omitted, a personal workspace is auto-created.",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateBoardRequest" },
              example: {
                title: "My New Board",
                description: "A board for planning",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Board created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Board" },
              },
            },
          },
          "401": { description: "Not authenticated" },
          "403": { description: "Not authorized (whitelist)" },
        },
      },
    },
    "/boards/{boardId}": {
      get: {
        tags: ["Boards"],
        summary: "Get board",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Board details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Board" },
              },
            },
          },
          "404": { description: "Board not found" },
        },
      },
      patch: {
        tags: ["Boards"],
        summary: "Update board",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  isPrivate: { type: "boolean" },
                  defaultRole: { type: "string", enum: ["viewer", "commenter", "editor"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Board updated" },
          "403": { description: "Not authorized" },
          "404": { description: "Board not found" },
        },
      },
      delete: {
        tags: ["Boards"],
        summary: "Delete board",
        description: "Only the board owner can delete a board",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": { description: "Board deleted" },
          "403": { description: "Not authorized (must be owner)" },
          "404": { description: "Board not found" },
        },
      },
    },
    "/boards/{boardId}/elements": {
      get: {
        tags: ["Board Elements"],
        summary: "Get board elements",
        description: "Get all elements (shapes, text, images, etc.) on a board",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "List of elements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    elements: {
                      type: "array",
                      items: { $ref: "#/components/schemas/BoardElement" },
                    },
                  },
                },
              },
            },
          },
          "403": { description: "Not authorized to view board" },
          "404": { description: "Board not found" },
        },
      },
      post: {
        tags: ["Board Elements"],
        summary: "Create element",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BoardElement" },
              example: {
                id: "element-uuid",
                type: "sticky",
                x: 100,
                y: 100,
                text: "Hello World",
                size: 200,
              },
            },
          },
        },
        responses: {
          "201": { description: "Element created" },
          "403": { description: "Not authorized (need editor role)" },
          "404": { description: "Board not found" },
        },
      },
      put: {
        tags: ["Board Elements"],
        summary: "Batch update elements",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  elements: {
                    type: "array",
                    items: { $ref: "#/components/schemas/BoardElement" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Elements updated" },
          "403": { description: "Not authorized" },
        },
      },
      delete: {
        tags: ["Board Elements"],
        summary: "Batch delete elements",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "Element IDs to delete",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Elements deleted" },
          "403": { description: "Not authorized" },
        },
      },
    },
    "/boards/{boardId}/members": {
      get: {
        tags: ["Board Members"],
        summary: "List board members",
        description: "Only board owner can view members",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "List of members",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      pubkey: { type: "string" },
                      role: { type: "string", enum: ["viewer", "commenter", "editor"] },
                    },
                  },
                },
              },
            },
          },
          "403": { description: "Not authorized (must be owner)" },
        },
      },
      post: {
        tags: ["Board Members"],
        summary: "Add board member",
        description: "Only board owner can add members",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  pubkey: { type: "string", description: "Hex pubkey or npub" },
                  role: { type: "string", enum: ["viewer", "commenter", "editor"] },
                },
                required: ["pubkey", "role"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Member added" },
          "403": { description: "Not authorized (must be owner)" },
        },
      },
    },
    "/boards/{boardId}/export": {
      get: {
        tags: ["Boards"],
        summary: "Export board",
        description: "Export board as JSON including all elements",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Board export JSON",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    board: { $ref: "#/components/schemas/Board" },
                    elements: {
                      type: "array",
                      items: { $ref: "#/components/schemas/BoardElement" },
                    },
                  },
                },
              },
            },
          },
          "403": { description: "Not authorized" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login with Nostr event",
        description: "Create a session using a signed Nostr event. Returns a session cookie.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  method: {
                    type: "string",
                    enum: ["ephemeral", "extension", "bunker", "secret"],
                  },
                  event: {
                    type: "object",
                    description: "Signed Nostr event with kind 27235",
                  },
                },
                required: ["method", "event"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful, session cookie set",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    pubkey: { type: "string" },
                    npub: { type: "string" },
                    method: { type: "string" },
                  },
                },
              },
            },
          },
          "403": { description: "Pubkey not in whitelist" },
          "422": { description: "Invalid event" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get current user",
        description: "Returns current user info or null if not authenticated",
        security: [{ nip98: [] }, { cookieAuth: [] }],
        responses: {
          "200": {
            description: "Current user or null",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        pubkey: { type: "string" },
                        npub: { type: "string" },
                      },
                    },
                    { type: "null" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
};

export function handleApiDocs() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optikon API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function handleOpenApiSpec() {
  return new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
