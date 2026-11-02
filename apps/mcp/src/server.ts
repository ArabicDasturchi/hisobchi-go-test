import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type ToolContext } from './tools.js';

export const SERVER_NAME = 'hisobchi-go';
export const SERVER_VERSION = '0.1.0';

export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Hisobchi Go: savdogar hisobini ko'rish va QORALAMA yaratish. Siz savdo yoza, tasdiqlay yoki bekor qila olmaysiz: " +
        'qoralamani savdogar ilovada tasdiqlaydi. Yig\'indini o\'zingiz hisoblamang, asboblar qaytargan jamini ishlating.',
    },
  );
  registerTools(server, ctx);
  return server;
}
