import { scanAll, formatMoney, formatTime, formatFloat, divideServers, getRootServers, clusterCopy, clusterKillAndRun, clusterKillAll, } from "./shared.js";
/** @returns Server with least money available to hack */
export function getServerToHack(ns, { minMoney = 1, skip = "" } = {}) {
    const servers = scanAll(ns);
    let serverToHack = null;
    let serverToHackMoney = Number.MAX_SAFE_INTEGER;
    for (const host of servers) {
        if (host === skip)
            continue;
        if (!ns.hasRootAccess(host))
            continue;
        if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel())
            continue;
        const money = ns.getServerMoneyAvailable(host);
        if (money < minMoney)
            continue;
        if (money < serverToHackMoney) {
            serverToHackMoney = money;
            serverToHack = host;
        }
    }
    return [serverToHack, serverToHackMoney];
}
const flags = [
    ["daemon", false],
    ["time", 10],
    ["min-money", 1_000_000],
    ["weaken-ratio", 0.1],
    ["grow-ratio", 0],
    ["hack-ratio", 1],
    ["start-hack-threshold", 0.9],
    ["stop-hack-threshold", 0.7],
    ["target", ""],
    ["skip", ""],
];
export function autocomplete(data) {
    data.flags(flags);
    return [...data.servers];
}
export async function main(ns) {
    let { daemon, time, ["min-money"]: minMoney, ["weaken-ratio"]: weakenRatio, ["grow-ratio"]: growRatio, ["hack-ratio"]: hackRatio, ["start-hack-threshold"]: startHackThreshold, ["stop-hack-threshold"]: stopHackThreshold, target: fixedTarget, skip, } = ns.flags(flags);
    if (fixedTarget && !growRatio)
        growRatio = 0.45;
    const hackScript = "dumb-hack.js";
    const growScript = "dumb-grow.js";
    const weakenScript = "dumb-weaken.js";
    const [weakenCluster, growCluster, hackCluster] = divideServers(getRootServers(ns), [weakenRatio, growRatio, hackRatio], (host) => ns.getServerMaxRam(host));
    ns.print({
        weakenRatio,
        growRatio,
        hackRatio,
        weakenCluster,
        growCluster,
        hackCluster,
    });
    if (daemon)
        ns.tail();
    ns.disableLog("ALL");
    await clusterCopy(ns, hackCluster, hackScript);
    await clusterCopy(ns, growCluster, growScript);
    await clusterCopy(ns, weakenCluster, weakenScript);
    ns.atExit(() => {
        [...hackCluster, ...weakenCluster, ...growCluster].forEach((host) => ns.killall(host));
    });
    let serverToHack = null;
    let ishacking = false;
    let isgrowing = false;
    while (true) {
        const [newTarget, money] = fixedTarget
            ? [fixedTarget, ns.getServerMoneyAvailable(fixedTarget)]
            : getServerToHack(ns, { minMoney, skip });
        if (serverToHack !== newTarget) {
            serverToHack = newTarget;
            if (serverToHack) {
                clusterKillAndRun(ns, weakenCluster, weakenScript, serverToHack);
                clusterKillAndRun(ns, growCluster, growScript, serverToHack);
                if (!fixedTarget)
                    clusterKillAndRun(ns, hackCluster, hackScript, serverToHack);
            }
        }
        if (fixedTarget && money) {
            if (money >= ns.getServerMaxMoney(serverToHack) * startHackThreshold &&
                !ishacking) {
                ishacking = true;
                isgrowing = false;
                clusterKillAndRun(ns, hackCluster, hackScript, serverToHack);
            }
            if (money < ns.getServerMaxMoney(serverToHack) * stopHackThreshold &&
                ishacking) {
                ishacking = false;
                clusterKillAll(ns, hackCluster);
            }
            if (!ishacking && !isgrowing) {
                isgrowing = true;
                clusterKillAndRun(ns, growCluster, growScript, serverToHack);
            }
        }
        if (serverToHack) {
            ns.print([
                ishacking ? "H" : "-",
                serverToHack,
                formatMoney(money ?? Number.NaN),
                formatFloat(ns.getServerSecurityLevel(serverToHack)),
                formatTime(ns.getWeakenTime(serverToHack)),
                formatTime(ns.getGrowTime(serverToHack)),
                formatTime(ns.getHackTime(serverToHack)),
            ].join(", "));
        }
        await ns.asleep(time * 1000);
    }
}
