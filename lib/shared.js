/**
 * Returns a list of all servers available in the game
 *
 * @example
 *   const allServers = scanAll(ns);
 */
export function scanAll(ns, target = ns.getHostname(), visited = new Set()) {
    visited.add(target);
    return ns
        .scan(target)
        .filter((child) => !visited.has(child))
        .flatMap((child) => [child, ...scanAll(ns, child, visited)]);
}
export function getMaxThreads(ns, script, host) {
    return Math.floor((ns.getServerMaxRam(host) - ns.getServerUsedRam(host)) /
        ns.getScriptRam(script));
}
/**
 * @example
 *   divideServers(["foodnstuff", "n00dles", "joesgun"], [0.5, 0.5], (host) =>
 *     ns.getServerMoney(host)
 *   );
 *   // [['foodnstuff'], ['n00dles', 'joesgun']]
 */
export function divideServers(servers, slices, getValue) {
    const result = Array.from({ length: slices.length }, () => []);
    let i = 0;
    let j = -1;
    servers = servers.sort((a, b) => getValue(b) - getValue(a));
    const values = servers.map((server) => getValue(server));
    const total = values.reduce((acc, v) => acc + v, 0);
    let left = 0;
    while (j < slices.length) {
        while (left > 0) {
            if (i >= servers.length)
                return result;
            result[j].push(servers[i]);
            left -= values[i];
            i++;
        }
        j++;
        left = (slices[j] || 0) * total;
    }
    return result;
}
export function runFull(ns, script, host, target) {
    const threads = getMaxThreads(ns, script, host);
    return threads > 0 && ns.exec(script, host, threads, target);
}
export function clusterRun(ns, cluster, script, target) {
    for (const host of cluster) {
        ns.killall(host);
        if (!runFull(ns, script, host, target))
            ns.print(`Failed to run ${script} on ${host}`);
    }
}
export const formatTable = (values) => {
    if (!values.length)
        return "";
    const paddings = values[0].map((_, i) => values.reduce((acc, v) => Math.max(v[i].length, acc), 0));
    return values
        .map((subvalues) => subvalues.map((v, i) => v.padStart(paddings[i])).join(" "))
        .join("\n");
};
const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    notation: "compact",
    compactDisplay: "short",
});
const floatFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});
export const formatMoney = (v) => moneyFormatter.format(v);
export const formatFloat = (v) => floatFormatter.format(v);
export const formatInteger = (v) => integerFormatter.format(v);
export const formatRam = (v) => `${v}G`;
const sec = 1000;
const min = 60 * sec;
export const formatTime = (v) => {
    return `${Math.floor(v / min)}m${Math.floor((v % min) / sec)}s`;
};
export const formatPercent = (v) => `${formatFloat(v * 100)}%`;
