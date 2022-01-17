import { scanAll, formatTable } from "./shared";
import { sumStats, Server, HACK, WEAKEN, GROW } from "./Server";
function printTable(ns, servers) {
  const table = [
    ["hostname", "sec", "weakentime", "money", "max-money", "money %"]
  ];
  servers.forEach((server) => {
    table.push([
      server.hostname,
      server.security.remaining.toFixed(2),
      (server.weaken.time / 1e3).toFixed(0),
      (server.money / 1e6).toFixed(0),
      (server.maxMoney / 1e6).toFixed(0),
      (server.money / server.maxMoney * 100).toFixed(1)
    ].map((a) => a.toString()));
  });
  ns.print(formatTable(table));
}
export async function main(ns) {
  ns.tail();
  ns.disableLog("ALL");
  const { localRam, table } = ns.flags([
    ["localRam", false],
    ["table", true]
  ]);
  const serversMap = {};
  while (true) {
    ns.clearLog();
    const nodes = scanAll(ns);
    if (localRam) {
      nodes.push("home");
    }
    (function detectExtraNodes() {
      const newServers = nodes.filter((node) => !serversMap[node]);
      if (newServers.length) {
        ns.print(`found ${newServers.length} new servers`);
        newServers.forEach((node) => {
          serversMap[node] = new Server(ns, node);
        });
      }
    })();
    const rootAccessServers = nodes.map((node) => serversMap[node]).filter((server) => server.root);
    const ramServers = rootAccessServers.filter((server) => server.totalThreads > 0).sort((a, b) => b.ram - a.ram);
    const serversToHack = rootAccessServers.sort((a, b) => b.sortFactor - a.sortFactor).filter((server) => !!server.maxMoney && server.canHack).filter((server) => server.weaken.time / 1e3 / 60 < 2);
    let delay = 0;
    const serverToHack = serversToHack[0];
    table && printTable(ns, [serverToHack]);
    for (const ramServer of ramServers) {
      const weakenStats = (security) => sumStats({
        weaken: security / WEAKEN
      });
      const growStats = (relativeIncrease) => {
        const threads = ns.growthAnalyze(serverToHack.hostname, relativeIncrease);
        return sumStats({ grow: threads }, weakenStats(threads * GROW));
      };
      const hackStats = () => {
        const increase = ns.hackAnalyze(serverToHack.hostname) + 1;
        return sumStats({ hack: 1 }, weakenStats(HACK), growStats(increase));
      };
      delay = await ramServer.doThreads(serverToHack, weakenStats(serverToHack.security.remaining), 0, weakenStats(serverToHack.security.remaining).weaken);
      await ns.sleep(5);
      const growThreads = growStats(serverToHack.money ? serverToHack.maxMoney / serverToHack.money : 1);
      delay = await ramServer.doThreads(serverToHack, growThreads, delay, growThreads.grow + growThreads.weaken);
      await ns.sleep(5);
      delay = await ramServer.doThreads(serverToHack, hackStats(), delay, ramServer.totalThreads);
      await ns.sleep(5);
    }
    ns.print("done");
    await ns.sleep(serverToHack.weaken.time + delay + 2e3);
  }
}
