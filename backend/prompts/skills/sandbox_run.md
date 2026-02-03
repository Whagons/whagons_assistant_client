# Sandbox_Run Tool

Use Sandbox_Run to execute small sandboxed JavaScript snippets in the user's browser (QuickJS-in-WASM in a Web Worker).

## Capabilities
- Runs JavaScript in a secure sandbox environment
- Executes in QuickJS-in-WASM within a Web Worker
- Currently has access to: `api.addUser({ email, name? })` (stubbed, returns mock success object)

## Limitations
- Cannot access DOM
- Cannot access network
- Cannot access cookies
- Only explicitly exposed capabilities are available

## When to Use
- Small, quick JavaScript operations
- Testing or demonstrating JavaScript code
- Using the exposed API capabilities

## Best Practices
- Keep code simple and focused
- Remember the sandbox limitations
- Explain what the code will do
- Use Execute_TypeScript for more complex operations with network access
