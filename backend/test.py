import os
from pydantic_ai.mcp import MCPServerStdio
from dotenv import load_dotenv
import asyncio

from ai.wrapper import MCPServerStdioSchema
load_dotenv()

tenant_id = os.getenv("TENANT_ID")
client_id = os.getenv("APP_ID")
client_secret = os.getenv("SECRET")
tavily_api_key = os.getenv("TAVILY_API_KEY")

server = MCPServerStdio(
    "npx",
    ["-y", "@merill/lokka", "stdio"],
    {
        "TENANT_ID": tenant_id,
        "CLIENT_ID": client_id,
        "CLIENT_SECRET": client_secret,
    },
)


async def main():
    async with server:
        print(await server.list_tools())


if __name__ == "__main__":
    asyncio.run(main())
