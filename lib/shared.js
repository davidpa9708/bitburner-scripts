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
export function trace(ns, target, host = ns.getHostname(), visited = new Set()) {
    visited.add(host);
    const children = ns.scan(host).filter((child) => !visited.has(child));
    for (const child of children) {
        if (child === target) {
            return [host, target];
        }
        const path = trace(ns, target, child, visited);
        if (path) {
            return [host, ...path];
        }
    }
    return null;
}
export function getRootServers(ns) {
    return scanAll(ns).filter((host) => ns.hasRootAccess(host));
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
export function divideServersV2(servers, times, getValue) {
    const result = Array.from({ length: times }, () => []);
    const resultValue = Array.from({ length: times }, () => 0);
    const sortedServers = _.sortBy(servers, (v) => -getValue(v));
    for (const server of sortedServers) {
        const i = _.minBy(_.range(times), ((i) => resultValue[i]));
        result[i].push(server);
        resultValue[i] += getValue(server);
    }
    return result;
}
export function runFull(ns, script, host, ...args) {
    const threads = getMaxThreads(ns, script, host);
    return threads > 0 && ns.exec(script, host, threads, ...args);
}
export const formatTable = (values) => {
    if (!values.length)
        return "";
    const paddings = values[0].map((_, i) => values.reduce((acc, v) => Math.max(v[i].length, acc), 0));
    return values
        .map((subvalues) => subvalues.map((v, i) => v.padStart(paddings[i])).join(" "))
        .join("\n");
};
export function renderTable(headers, rows, { noHeader = false } = {}) {
    const defaultFormat = (v) => v.toString();
    const parsed = headers.map((header) => typeof header === "string" ? { name: header } : header);
    const headerRow = _.map(parsed, "name");
    const parsedRows = rows.map((row) => parsed.map(({ name, format = defaultFormat, value = (row) => row[name] }) => format(value(row))));
    return formatTable(noHeader ? parsedRows : [headerRow, ...parsedRows]);
}
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
export function getSchedule(tasks, getTime) {
    const WAIT_TIME = 50;
    let mapped = tasks.map((t) => [t, getTime(t)]);
    const biggest = _.maxBy(mapped, "1")[1];
    mapped = mapped.slice(0, Math.ceil(biggest / WAIT_TIME));
    const extra = mapped.length * WAIT_TIME;
    const maxTime = _.maxBy(mapped, "1")[1] + extra;
    const total = mapped.length;
    const withTime = mapped.map(([t, time], i) => [
        t,
        maxTime - (total - i) * WAIT_TIME - time,
    ]);
    const min = _.minBy(withTime, "1")[1];
    const adjusted = withTime.map(([t, time]) => [t, time - min]);
    return { tasks: adjusted, maxTime: maxTime - min - WAIT_TIME };
}
export async function schedule(ns, tasks) {
    const { tasks: schduledTasks, maxTime } = getSchedule(tasks, _.iteratee("time"));
    for (const [{ run }, startTime] of schduledTasks) {
        run(startTime);
    }
    await ns.asleep(maxTime);
}
