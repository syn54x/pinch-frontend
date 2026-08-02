# Penny chat speaks Vercel AI SDK v6, outside the generated client

The backend's `POST /api/v1/penny/chat` streams the Vercel AI Data Stream protocol (SSE, `sdk_version=6`, via pydantic-ai's `VercelAIAdapter`), and stored conversations are served in Vercel UI-message JSON — the endpoint was built for `useChat`, and it is deliberately untyped in the OpenAPI spec. We adopt `ai` + `@ai-sdk/react` (major pinned to 6) as the chat transport and message model instead of hand-rolling an SSE reader, accepting one carve-out from the "all API access goes through the generated hey-api client" rule.

## Consequences

- The chat transport must reproduce `src/api/client.ts` plumbing itself (`credentials: 'include'`, the `x-csrftoken` echo on unsafe methods, 401 → login) via a custom fetch handed to the SDK transport — chat requests do not pass through the generated client.
- The `ai` major version is a wire contract with the backend that **`just check-drift` cannot see** (chat has no schema in `openapi.json`). Bumping `ai` past v6, or the backend's adapter past `sdk_version=6`, is a cross-repo contract change and must be coordinated like an `e2e/backend.pin` bump.
- `ConversationOut.messages` (untyped `object[]` in the generated types) is cast to the SDK's `UIMessage[]` at the seam — the SDK's types, not the generated ones, are authoritative for message shape.
