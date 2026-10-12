import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import express from "express";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const require = createRequire(import.meta.url);
const packageDist = (name) => path.dirname(require.resolve(name));
const app = express();

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

app.use("/scram", express.static(scramjetPath));
app.use("/controller", express.static(packageDist("@mercuryworkshop/scramjet-controller")));
app.use("/epoxy", express.static(packageDist("@mercuryworkshop/epoxy-transport")));
app.use("/libcurl", express.static(packageDist("@mercuryworkshop/libcurl-transport")));
app.use(express.static("public"));

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname !== "/wisp/") {
    socket.destroy();
    return;
  }
  wisp.routeRequest(req, socket, head);
});

// Destination connections use public DNS so local resolver issues and
// filtering cannot break sites, prefer IPv4 answers for reachability, and
// cache lookups longer.
const wispDnsServers = (process.env.WISP_DNS_SERVERS || "1.1.1.1,1.0.0.1")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
wisp.options.dns_method = "resolve";
if (wispDnsServers.length > 0) wisp.options.dns_servers = wispDnsServers;
wisp.options.dns_result_order = "ipv4first";
wisp.options.dns_ttl = 3600;

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Nightshift is ready at http://localhost:${port}`));
