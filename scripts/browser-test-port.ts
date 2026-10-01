import { createServer } from "node:net";

export async function browserTestPort(environmentKey: string): Promise<number> {
  const inherited = process.env[environmentKey];
  if (inherited !== undefined) {
    const port = Number(inherited);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid browser test port in ${environmentKey}.`);
    }
    return port;
  }
  const server = createServer();
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a browser test port.")));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          process.env[environmentKey] = String(address.port);
          resolve(address.port);
        }
      });
    });
  });
}
