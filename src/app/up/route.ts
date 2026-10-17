// Health check endpoint used by kamal-proxy before switching traffic.
export async function GET() {
  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
