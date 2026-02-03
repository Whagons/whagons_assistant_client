# Microsoft Graph API via Execute_TypeScript

When using `Execute_TypeScript`, a `graph` module is available for making authenticated Microsoft Graph API requests. Authentication is handled automatically using OAuth2 client credentials flow.

## Available Functions

### `graph.request(version, path, method, body?, queryParams?, headers?)`
Generic Graph API request. Returns `{ status, ok, data, error? }`.

### `graph.get(path, queryParams?, version?)`
GET request. Version defaults to "v1.0".

### `graph.post(path, body, version?)`
POST request.

### `graph.patch(path, body, version?)`
PATCH request.

### `graph.del(path, version?)`
DELETE request.

### `graph.batch(requests, version?)`
Batch up to 20 requests in a single call. Each request: `{ id, method, url, body?, headers? }`.

## Examples

### List users
```typescript
const result = await graph.get("/users", { "$select": "id,displayName,mail", "$top": "10" });
console.log(result.data.value);
```

### Get user's calendar events
```typescript
const result = await graph.get("/users/{user-id}/events", {
  "$select": "subject,start,end",
  "$top": "5",
  "$orderby": "start/dateTime"
});
console.log(result.data.value);
```

### Send an email
```typescript
const result = await graph.post("/users/{user-id}/sendMail", {
  message: {
    subject: "Hello",
    body: { contentType: "Text", content: "Hello from the assistant" },
    toRecipients: [{ emailAddress: { address: "recipient@example.com" } }]
  }
});
console.log(result.ok ? "Sent!" : result.error);
```

### List Teams channels
```typescript
const result = await graph.get("/teams/{team-id}/channels");
console.log(result.data.value);
```

### Batch request
```typescript
const result = await graph.batch([
  { id: "1", method: "GET", url: "/users?$top=5" },
  { id: "2", method: "GET", url: "/groups?$top=5" }
]);
console.log(result.data.responses);
```

## Error Handling
Always check `result.ok` before using `result.data`. If `result.ok` is false, `result.error` contains the error message and `result.data` contains the full error body from Microsoft.

If you receive a 403/401 error, it likely means the Azure AD app registration needs additional API permission scopes. Search the web to find which permission is required for the endpoint.

## Important Notes
- Use `v1.0` for stable endpoints, `beta` for preview features
- The `$select` query param reduces response size — always use it when you only need specific fields
- For large result sets, check `result.data["@odata.nextLink"]` for pagination
- Batch requests are limited to 20 sub-requests per call
