# Marginal Gains → Optikon Integration Spec

## Overview

Marginal Gains (MG) integrates with Optikon to create and link to visual boards. MG authenticates using NIP-98 HTTP Auth, allowing it to act on behalf of the user's Nostr identity.

**Base URL:** `https://optikon.otherstuff.ai` (or `http://localhost:3025` for dev)

---

## Authentication: NIP-98

Every API request must include a signed Nostr event in the Authorization header.

### Header Format
```
Authorization: Nostr <base64-encoded-event>
```

### Event Structure (Kind 27235)
```json
{
  "kind": 27235,
  "created_at": 1706500000,
  "tags": [
    ["u", "https://optikon.otherstuff.ai/boards"],
    ["method", "POST"]
  ],
  "content": "",
  "pubkey": "abc123...",
  "id": "...",
  "sig": "..."
}
```

### Required Tags
| Tag | Value | Description |
|-----|-------|-------------|
| `u` | Full URL | Exact URL being requested (including query params) |
| `method` | HTTP method | GET, POST, PATCH, DELETE, etc. |

### Validation Rules
- Event must be signed by user's Nostr keypair
- `created_at` must be within 60 seconds of server time
- URL must match exactly (normalize trailing slashes)
- Method must match request method

### Signing Example (TypeScript/nostr-tools)
```typescript
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';

function createNip98Auth(url: string, method: string, secretKey: Uint8Array): string {
  const event = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: '',
  }, secretKey);

  return 'Nostr ' + btoa(JSON.stringify(event));
}

// Usage
const authHeader = createNip98Auth('https://optikon.otherstuff.ai/boards', 'POST', userSecretKey);
```

---

## API Endpoints

### 1. List Workspaces

Get all workspaces the user has access to.

**Request:**
```http
GET /workspaces
Authorization: Nostr <token>
```

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "My Workspace",
    "owner_pubkey": "abc123...",
    "created_at": 1706500000
  }
]
```

**Notes:**
- A personal workspace is auto-created for each user on first board creation
- If user has workspaces, use the first one's `id`
- If empty array, you can still create a board without `workspaceId` - it will auto-create a personal workspace

---

### 2. List Boards

Get all boards accessible to the user, optionally filtered by workspace.

**Request:**
```http
GET /boards?workspaceId=1
Authorization: Nostr <token>
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `workspaceId` | number | Optional. Filter to specific workspace |

**Response (200):**
```json
[
  {
    "id": 42,
    "title": "Sprint Planning",
    "description": "Q1 2024 planning board",
    "owner_pubkey": "abc123...",
    "workspace_id": 1,
    "is_private": 0,
    "archived_at": null,
    "created_at": "2024-01-29T12:00:00.000Z",
    "updated_at": "2024-01-29T12:00:00.000Z",
    "element_count": 15,
    "online_users": []
  }
]
```

---

### 3. Create Board

Create a new board in a workspace.

**Request:**
```http
POST /boards
Authorization: Nostr <token>
Content-Type: application/json

{
  "title": "My New Board",
  "description": "Optional description",
  "workspaceId": 1
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Board title (defaults to "Untitled Board") |
| `description` | string | No | Board description |
| `workspaceId` | number | No | Workspace to create board in (auto-creates personal workspace if omitted) |
| `isPrivate` | boolean | No | Whether board is private (default: false) |

**Response (201):**
```json
{
  "id": 43,
  "title": "My New Board",
  "description": "Optional description",
  "owner_pubkey": "abc123...",
  "owner_npub": "npub1...",
  "workspace_id": 1,
  "is_private": 0,
  "default_role": "editor",
  "starred": 0,
  "archived_at": null,
  "created_at": "2024-01-29T12:00:00.000Z",
  "updated_at": "2024-01-29T12:00:00.000Z",
  "last_accessed_at": null
}
```

**Note:** Request body uses camelCase (`workspaceId`), response uses snake_case (`workspace_id`).

**Error Responses:**
- `400` - Missing required fields
- `401` - Not authenticated
- `422` - Invalid workspaceId or user not a workspace member

---

## Integration Flow

### Step 1: User Initiates Board Creation in MG

User clicks "Create Optikon Board" button in Marginal Gains.

### Step 2: MG Creates Board (Simple - No Workspace Lookup Needed)

```typescript
const url = `${OPTIKON_URL}/boards`;
const board = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': createNip98Auth(url, 'POST', userKey),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'Board from Marginal Gains',
    description: 'Created via MG integration',
    // workspaceId is optional - auto-creates personal workspace if omitted
  }),
}).then(r => r.json());
```

### Step 3: MG Constructs Board URL

```typescript
// Board URL format
const boardUrl = `${OPTIKON_URL}/b/${board.id}`;

// Example: https://optikon.otherstuff.ai/b/43
```

### Step 4: MG Displays Link

Display a clickable button/link to the user:

```html
<a href="https://optikon.otherstuff.ai/b/43" target="_blank">
  Open Board in Optikon
</a>
```

---

## Complete Example Implementation

```typescript
const OPTIKON_URL = 'https://optikon.otherstuff.ai';

interface OptikonBoard {
  id: number;
  title: string;
  description: string | null;
  owner_pubkey: string | null;
  owner_npub: string | null;
  workspace_id: number | null;
  is_private: number;
  default_role: string;
  starred: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OptikonWorkspace {
  id: number;
  name: string;
}

async function createOptikonBoard(
  userSecretKey: Uint8Array,
  title: string,
  description?: string
): Promise<{ board: OptikonBoard; url: string }> {

  // Create board (workspace auto-created if needed)
  const boardsUrl = `${OPTIKON_URL}/boards`;
  const boardRes = await fetch(boardsUrl, {
    method: 'POST',
    headers: {
      'Authorization': createNip98Auth(boardsUrl, 'POST', userSecretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      description: description ?? '',
      // workspaceId omitted - auto-creates personal workspace
    }),
  });

  if (!boardRes.ok) {
    const error = await boardRes.json();
    throw new Error(`Failed to create board: ${error.message}`);
  }

  const board: OptikonBoard = await boardRes.json();

  // Return board with URL
  return {
    board,
    url: `${OPTIKON_URL}/b/${board.id}`,
  };
}

// Helper: Create NIP-98 auth header
function createNip98Auth(url: string, method: string, secretKey: Uint8Array): string {
  const { finalizeEvent } = require('nostr-tools/pure');

  const event = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: '',
  }, secretKey);

  return 'Nostr ' + Buffer.from(JSON.stringify(event)).toString('base64');
}
```

---

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 400 | Bad request / missing fields | Check request body |
| 401 | Auth failed | Re-sign NIP-98 event, check timestamp |
| 403 | Forbidden | User lacks permission for this action |
| 404 | Not found | Resource doesn't exist |
| 422 | Validation error | Check field values (e.g., invalid workspaceId) |
| 429 | Rate limited | Back off and retry |

---

## Security Notes

1. **Never expose user's secret key** - Sign events server-side or use NIP-07 browser extension
2. **Events expire in 60 seconds** - Generate fresh event for each request
3. **URL must match exactly** - Include query params, normalize trailing slashes
4. **HTTPS required in production** - Prevent token interception

---

## Testing Checklist

- [ ] Can authenticate with NIP-98 header
- [ ] Can list workspaces
- [ ] Can list boards in workspace
- [ ] Can create new board
- [ ] Board URL opens correctly in browser
- [ ] Error states handled gracefully
- [ ] Works with user's Nostr identity
