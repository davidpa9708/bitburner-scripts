import { formatFloat, formatMoney, formatPercent, formatTime, getMaxThreads, renderTable, scanAll, getSchedule, } from "./shared";
const FILES = {
    weaken: "weaken.js",
    grow: "grow.js",
    hack: "hack.js",
};
function runScript(ns, script, host, target, { threads = getMaxThreads(ns, FILES[script], host), delay = 0 } = {}) {
    ns.exec(FILES[script], host, threads, target, "--delay", delay);
}
async function weakenTarget(ns, target, servers) {
    for (const host of servers) {
        runScript(ns, "weaken", host, target);
    }
    await ns.asleep(ns.getWeakenTime(target));
}
const WEAKEN_COST = 0.05;
const GROW_COST = 0.004;
const HACK_COST = 0.002;
const calcYFromT = (threads, a, b) => Math.floor(threads / (b / a + 1));
/**
 * - `t = x + y`
 * - `ax = by`
 *
 * @returns `[x, y]`
 * @note `x` and `y` won't be exact, they will be floored and probably will miss by 1, and will try to return at least 1 for x and y
 */
export const calcFunc = (threads, a, b) => {
    const x = calcYFromT(threads, b, a);
    const y = calcYFromT(threads, a, b);
    if ((x === 0 || y === 0) && threads >= 2) {
        return [1, threads - 1];
    }
    return [x, y];
};
/** @returns Cost of a thread in ram is the most expensive script */
const getThreadCost = (ns) => Math.max(...["weaken", "grow", "hack"].map((s) => ns.getScriptRam(FILES[s])));
const getRam = (ns, host) => ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
async function growTarget(ns, target, servers) {
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
            { host, threads: gt, script: "grow" },
            { host, threads: wt, script: "weaken" },
        ];
    })
        .filter((t) => t.threads > 0);
    const { tasks, maxTime } = getSchedule(unsortedTasks, ({ script }) => runtime[script]);
    for (const [{ host, threads, script }, delay] of tasks) {
        runScript(ns, script, host, target, { threads, delay });
    }
    await ns.asleep(maxTime);
}
async function hackTarget(ns, target, servers) {
    const THREAD_RAM = getThreadCost(ns);
    const runtime = {
        grow: ns.getGrowTime(target),
        weaken: ns.getWeakenTime(target),
        hack: ns.getHackTime(target),
    };
    const unsortedTasks = servers
        .flatMap((host) => {
        const ram = getRam(ns, host);
        const threads = Math.floor(ram / THREAD_RAM);
        const [wt, ht] = calcFunc(threads / 2, WEAKEN_COST, HACK_COST);
        const [_, gt] = calcFunc(threads / 2, WEAKEN_COST, GROW_COST);
        return [
            { host, threads: ht, script: "hack" },
            { host, threads: wt, script: "weaken" },
            { host, threads: gt, script: "grow" },
            { host, threads: wt, script: "weaken" },
        ];
    })
        .filter((t) => t.threads > 0);
    const { tasks, maxTime } = getSchedule(unsortedTasks, ({ script }) => runtime[script]);
    for (const [{ host, threads, script }, delay] of tasks) {
        runScript(ns, script, host, target, { threads, delay });
    }
    await ns.asleep(maxTime);
}
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail();
    const getRootServers = () => scanAll(ns)
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
            await ns.scp([FILES.weaken, FILES.hack, FILES.grow], ns.getHostname(), host);
        }
        if (server.sec > server.minSec + 5)
            await weakenTarget(ns, target, rootServers);
        else if (server.money < server.maxMoney * 0.9 &&
            server.money < ns.getPlayer().money)
            await growTarget(ns, target, rootServers);
        else
            await hackTarget(ns, target, rootServers);
        await ns.asleep(100); // always wait a bit just in case
    }
}
function getBestServersToHack(ns) {
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
        growth: ns.getServerGrowth(host),
    }));
    const sorted = _.orderBy(_.filter(servers, (server) => server.maxMoney > 0), [
        (server) => (server.weakenTime < 60 * 1000 ? 0 : 1),
        (server) => (server.weakenTime < 2 * 60 * 1000 ? 0 : 1),
        (server) => (server.weakenTime < 3 * 60 * 1000 ? 0 : 1),
        (server) => (server.hackChance > 0.8 ? 0 : 1),
        (server) => -(server.growth / server.weakenTime),
        // (server) => -(server.maxMoney / server.weakenTime),
    ]);
    return sorted;
}
function showInfo(ns, servers) {
    ns.print("\n", renderTable([
        "host",
        {
            name: "money",
            value: (server) => `${formatMoney(server.money)}/${formatMoney(server.maxMoney)}`,
        },
        {
            name: "sec",
            value: (server) => `${formatFloat(server.sec)}/${formatFloat(server.minSec)}`,
        },
        { name: "hackChance", format: formatPercent },
        { name: "weakenTime", format: formatTime },
        { name: "growth", format: formatFloat },
    ], servers));
}
// const getThreadsToGrow = (target: string) =>
//   ns.growthAnalyze(
//     target,
//     ns.getServerMaxMoney(target) / ns.getServerMoneyAvailable(target)
//   );
