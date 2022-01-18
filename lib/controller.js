import { scanAll, formatTable } from "./shared";
import { Server, HACK, WEAKEN, GROW } from "./Server";
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
    let serversToHack = rootAccessServers.sort((a, b) => b.sortFactor - a.sortFactor).filter((server) => !!server.maxMoney && server.canHack).filter((server) => server.weaken.time / 1e3 / 60 < 5);
    serversToHack = serversToHack.filter((server) => server.sortFactor * 10 > serversToHack[0].sortFactor);
    table && printTable(ns, serversToHack);
    let lastServer = 0;
    for (const ramServer of ramServers) {
      await ns.scp(["hack.js", "grow.js", "weaken.js"], "home", ramServer.hostname);
    }
    let weakGrow = true;
    while (lastServer < ramServers.length) {
      for (const serverToHack of serversToHack) {
        const getWeakenScripts = (security) => [
          {
            script: "weaken",
            threads: Math.ceil(security / WEAKEN)
          }
        ];
        const getGrowScripts = (relativeIncrease) => {
          const threads = ns.growthAnalyze(serverToHack.hostname, relativeIncrease);
          return [
            { script: "grow", threads: Math.ceil(threads) },
            ...getWeakenScripts(threads * GROW)
          ];
        };
        const getHackScripts = (percentToSteal = 0.6) => {
          const stolen = ns.hackAnalyze(serverToHack.hostname);
          const threads = percentToSteal / stolen;
          return [
            { script: "hack", threads: Math.ceil(threads) },
            ...getWeakenScripts(HACK * threads),
            ...getGrowScripts(1 / (1 - percentToSteal))
          ];
        };
        const scriptsBatch = [];
        if (weakGrow) {
          scriptsBatch.push(getWeakenScripts(serverToHack.security.remaining));
          scriptsBatch.push(getGrowScripts(serverToHack.money ? serverToHack.maxMoney / serverToHack.money : 2));
        }
        scriptsBatch.push(getHackScripts());
        let delay = 0;
        for (const scripts of scriptsBatch) {
          let remainingThreads = scripts.reduce((acc, { threads }) => acc + threads, 0);
          const stats = scripts.reduce((acc, { script, threads }) => {
            acc[script] += threads;
            return acc;
          }, { hack: 0, grow: 0, weaken: 0 });
          while (lastServer < ramServers.length && remainingThreads >= 1) {
            const ramServer = ramServers[lastServer];
            const usableThreads = Math.floor(Math.min(ramServer.totalThreads, remainingThreads));
            if (usableThreads < 1) {
              lastServer++;
              ns.print(`no more ram on ${ramServer.hostname}; server ${serverToHack.hostname}; new server ${serversToHack?.[lastServer]?.hostname || "none"}`);
              break;
            }
            delay = ramServer.doThreads(serverToHack, stats, delay, usableThreads);
            remainingThreads -= usableThreads;
          }
        }
      }
      ns.print("still more ram, will wait 5s");
      weakGrow = false;
      await ns.sleep(5e3);
    }
    await ns.sleep(serversToHack?.[0]?.weaken?.time + 5e3);
  }
}
