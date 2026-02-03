# Execute_TypeScript Tool

Use Execute_TypeScript to run TypeScript/JavaScript code for calculations, data processing, or complex logic.

## Capabilities

You can execute TypeScript code with access to built-in tools:
- **web.get(url), web.post(url, body), web.put(url, body), web.del(url)** - Make HTTP requests
- **web.fetch(url, options)** - Full fetch API control
- **tavily.search(query, options)** - Search the web using Tavily API
- **tavily.quickSearch(query)** - Quick search with immediate answer
- **math** - Complete mathjs library with ALL functions (evaluate, simplify, derivative, matrix ops, stats, units, complex numbers, etc.)
- All standard TypeScript/JavaScript features (Math, Date, Array methods, etc.)
- Top-level await is supported
- Use console.log() to output results
- 30 second execution timeout for long-running operations

## Important Notes

**IMPORTANT:** web, tavily, and math are available as function parameters - DO NOT import them. Just use them directly.

**IMPORTANT:** When using Execute_TypeScript, strongly prefer writing ONE comprehensive script that makes multiple API calls, performs multiple operations, and processes all data together, rather than calling Execute_TypeScript multiple times with separate scripts. Consolidate your logic into a single execution whenever possible for better performance and efficiency.

## Example Usage

### HTTP Requests
```typescript
const response = await web.get('https://api.example.com/data');
console.log(response.json);
```

### Web Search
```typescript
const results = await tavily.search('AI news');
console.log(results.answer);
```

### Math Operations
```typescript
// Use math directly (no import needed) - FULL mathjs library available
const result = math.evaluate('sqrt(16) + 5^2');
console.log(result);

const mean = math.mean([1, 2, 3, 4, 5]);
console.log(mean);

// Matrix operations
const matrix = math.matrix([[1, 2], [3, 4]]);
console.log(math.det(matrix));

// Units
console.log(math.unit('5 inch').to('cm').toString());

// Any mathjs function works
console.log(math.derivative('x^2', 'x').toString());
```

## When to Use
- Complex calculations or data processing
- Making API calls to external services
- Data transformation and analysis
- Mathematical operations beyond simple arithmetic
- When you need to combine multiple operations in one execution
