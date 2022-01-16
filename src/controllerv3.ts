import {
  formatFloat,
  formatMoney,
  formatPercent,
  formatTime,
  getMaxThreads,
  renderTable,
  scanAll,
  getSchedule,
} from "./shared";

function getBestServersToHack(ns: NS) {
  const servers = scanAll(ns)
    .filter((host) => ns.hasRootAccess(host))
    .map((host) => ({
      host,
      money: ns.getServerMoneyAvailable(host),
      maxMoney: ns.getServerMaxMoney(host),
      hackChance: ns.hackAnalyzeChance(host),
      weakenTime: ns.getWeakenTime(host),
      sec: ns.getServerSecurityLevel(host),
      minSec: ns.getServerMinSecurityLevel(host),
    }));

  const sorted = _.orderBy(
    _.filter(servers, (server) => server.maxMoney > 0),
    [
      (server) => (server.weakenTime < 60 * 1000 ? 0 : 1),
      (server) => (server.weakenTime < 2 * 60 * 1000 ? 0 : 1),
      (server) => (server.weakenTime < 3 * 60 * 1000 ? 0 : 1),
      (server) => (server.hackChance > 0.8 ? 0 : 1),
      (server) => -(server.maxMoney / server.weakenTime),
    ]
  );

  return sorted;
}

type Script = "hack" | "weaken" | "grow";

const FILES: Record<Script, string> = {
  weaken: "weaken.js",
  grow: "grow.js",
  hack: "hack.js",
};

function runScript(
  ns: NS,
  script: Script,
  host: string,
  target: string,
  { threads = getMaxThreads(ns, FILES[script], host), delay = 0 } = {}
) {
  ns.exec(FILES[script], host, threads, target, "--delay", delay);
}

async function weakenTarget(ns: NS, target: string, servers: string[]) {
  for (const host of servers) {
    runScript(ns, "weaken", host, target);
  }

  await ns.asleep(ns.getWeakenTime(target));
}

const WEAKEN_COST = 0.05;
const GROW_COST = 0.004;
const HACK_COST = 0.002;

const calcYFromT = (threads: number, a: number, b: number) =>
  Math.floor(threads / (b / a + 1));

/**
 * - `t = x + y`
 * - `ax = by`
 *
 * @returns `[x, y]`
 * @note `x` and `y` won't be exact, they will be floored and probably will miss by 1, and will try to return at least 1 for x and y
 */
export const calcFunc = (
  threads: number,
  a: number,
  b: number
): [number, number] => {
  const x = calcYFromT(threads, b, a);
  const y = calcYFromT(threads, a, b);
  if ((x === 0 || y === 0) && threads >= 2) {
    return [1, threads - 1];
  }
  return [x, y];
};

type Task = {
  host: string;
  threads: number;
  script: Script;
};

/** @returns Cost of a thread in ram is the most expensive script */
const getThreadCost = (ns: NS) =>
  Math.max(
    ...["weaken", "grow", "hack"].map((s) =>
      ns.getScriptRam(FILES[s as Script])
    )
  );

const getRam = (ns: NS, host: string) =>
  ns.getServerMaxRam(host) - ns.getServerUsedRam(host);

async function growTarget(ns: NS, target: string, servers: string[]) {
  const THREAD_RAM = getThreadCost(ns);

  const runtime = {
    grow: ns.getGrowTime(target),
    weaken: ns.getWeakenTime(target),
  };

  const unsortedTasks = servers
    .flatMap((host) => {
      const ram = getRam(ns, host);
      const threads = Math.floor(ram / THREAD_RAM);

      const [wt, gt] = calcFunc(threads, WEAKEN_COST, GROW_COST);

      return [
        { host, threads: gt, script: "grow" as const },
        { host, threads: wt, script: "weaken" as const },
      ];
    })
    .filter((t) => t.threads > 0);

  const { tasks, maxTime } = getSchedule(
    unsortedTasks,
    ({ script }) => runtime[script]
  );

  for (const [{ host, threads, script }, delay] of tasks) {
    runScript(ns, script, host, target, { threads, delay });
  }

  await ns.asleep(maxTime);
}

async function hackTarget(ns: NS, target: string, servers: string[]) {
  const THREAD_RAM = getThreadCost(ns);
  const runtime = {
    grow: ns.getGrowTime(target),
    weaken: ns.getWeakenTime(target),
    hack: ns.getHackTime(target),
  };

  const unsortedTasks: Task[] = servers
    .flatMap((host) => {
      const ram = getRam(ns, host);
      const threads = Math.floor(ram / THREAD_RAM);

      const [wt, ht] = calcFunc(threads / 2, WEAKEN_COST, HACK_COST);
      const [_, gt] = calcFunc(threads / 2, WEAKEN_COST, GROW_COST);

      return [
        { host, threads: ht, script: "hack" as const },
        { host, threads: wt, script: "weaken" as const },
        { host, threads: gt, script: "grow" as const },
        { host, threads: wt, script: "weaken" as const },
      ];
    })
    .filter((t) => t.threads > 0);

  const { tasks, maxTime } = getSchedule(
    unsortedTasks,
    ({ script }) => runtime[script]
  );

  for (const [{ host, threads, script }, delay] of tasks) {
    runScript(ns, script, host, target, { threads, delay });
  }

  await ns.asleep(maxTime);
}

export async function main(ns: NS) {
  ns.disableLog("ALL");
  ns.tail();

  const getRootServers = () =>
    scanAll(ns)
      .filter((host) => ns.hasRootAccess(host))
      .concat("home");

  ns.atExit(() => {
    getRootServers().forEach((host) => ns.killall(host));
  });

  while (true) {
    const servers = getBestServersToHack(ns);
    const server = servers[0];
    const target = server.host;

    showInfo(ns, servers.slice(0, 5).reverse());

    const rootServers = getRootServers();

    for (const host of rootServers.filter((p) => p === "home")) {
      await ns.scp(
        [FILES.weaken, FILES.hack, FILES.grow],
        ns.getHostname(),
        host
      );
    }

    if (server.sec > server.minSec + 5)
      await weakenTarget(ns, target, rootServers);
    else if (
      server.money < server.maxMoney * 0.9 &&
      server.money < ns.getPlayer().money
    )
      await growTarget(ns, target, rootServers);
    else await hackTarget(ns, target, rootServers);

    await ns.asleep(100); // always wait a bit just in case
  }
}

function showInfo(ns: NS, servers: ReturnType<typeof getBestServersToHack>) {
  ns.print(
    "\n",
    renderTable(
      [
        "host",
        {
          name: "money",
          value: (server) =>
            `${formatMoney(server.money)}/${formatMoney(server.maxMoney)}`,
        },
        {
          name: "sec",
          value: (server) =>
            `${formatFloat(server.sec)}/${formatFloat(server.minSec)}`,
        },
        { name: "hackChance", format: formatPercent },
        { name: "weakenTime", format: formatTime },
      ],
      servers
    )
  );
}

// const getThreadsToGrow = (target: string) =>
//   ns.growthAnalyze(
//     target,
//     ns.getServerMaxMoney(target) / ns.getServerMoneyAvailable(target)
//   );
