/**
 * Returns a list of all servers available in the game
 *
 * @example
 *   const allServers = scanAll(ns);
 */
export function scanAll(
  ns: NS,
  target = ns.getHostname(),
  visited = new Set()
): string[] {
  visited.add(target);

  return ns
    .scan(target)
    .filter((child) => !visited.has(child))
    .flatMap((child) => [child, ...scanAll(ns, child, visited)]);
}

export function trace(
  ns: NS,
  target: string,
  host = ns.getHostname(),
  visited = new Set<string>()
): string[] | null {
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

export function getRootServers(ns: NS) {
  return scanAll(ns).filter((host) => ns.hasRootAccess(host));
}

export function getMaxThreads(ns: NS, script: string, host: string) {
  return Math.floor(
    (ns.getServerMaxRam(host) - ns.getServerUsedRam(host)) /
      ns.getScriptRam(script)
  );
}

/**
 * @example
 *   divideServers(["foodnstuff", "n00dles", "joesgun"], [0.5, 0.5], (host) =>
 *     ns.getServerMoney(host)
 *   );
 *   // [['foodnstuff'], ['n00dles', 'joesgun']]
 */
export function divideServers<T>(
  servers: T[],
  slices: number[],
  getValue: (host: T) => number
): T[][] {
  const result: T[][] = Array.from({ length: slices.length }, () => []);
  let i = 0;
  let j = -1;

  servers = servers.sort((a, b) => getValue(b) - getValue(a));
  const values = servers.map((server) => getValue(server));
  const total = values.reduce((acc, v) => acc + v, 0);

  let left = 0;

  while (j < slices.length) {
    while (left > 0) {
      if (i >= servers.length) return result;

      result[j].push(servers[i]);
      left -= values[i];

      i++;
    }
    j++;
    left = (slices[j] || 0) * total;
  }
  return result;
}

export function divideServersV2<T>(
  servers: T[],
  times: number,
  getValue: (host: T) => number
): T[][] {
  const result: T[][] = Array.from({ length: times }, () => []);

  const resultValue = Array.from({ length: times }, () => 0);

  const sortedServers = _.sortBy(servers, (v) => -getValue(v));

  for (const server of sortedServers) {
    const i = _.minBy<number>(
      _.range(times),
      ((i: number) => resultValue[i]) as any
    ) as number;
    result[i].push(server);
    resultValue[i] += getValue(server);
  }

  return result;
}

export function runFull(
  ns: NS,
  script: string,
  host: string,
  ...args: (string | number)[]
) {
  const threads = getMaxThreads(ns, script, host);

  return threads > 0 && ns.exec(script, host, threads, ...args);
}

export const formatTable = (values: string[][]) => {
  if (!values.length) return "";

  const paddings = values[0].map((_, i) =>
    values.reduce((acc, v) => Math.max(v[i].length, acc), 0)
  );

  return values
    .map((subvalues) =>
      subvalues.map((v, i) => v.padStart(paddings[i])).join(" ")
    )
    .join("\n");
};

interface HeaderInfo<T = any> {
  name: string;
  value?: (v: T) => any;
  format?: (v: any) => string;
}

type Header<T = any> = keyof T | HeaderInfo<T>;

export function renderTable<T = any>(
  headers: Header<T>[],
  rows: T[],
  { noHeader = false } = {}
): string {
  const defaultFormat = (v: any) => v.toString();

  const parsed = headers.map((header) =>
    typeof header === "string" ? { name: header } : header
  ) as HeaderInfo[];

  const headerRow = _.map(parsed, "name");

  const parsedRows = rows.map((row) =>
    parsed.map(({ name, format = defaultFormat, value = (row) => row[name] }) =>
      format(value(row))
    )
  );

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

export const formatMoney = (v: number) => moneyFormatter.format(v);

export const formatFloat = (v: number) => floatFormatter.format(v);

export const formatInteger = (v: number) => integerFormatter.format(v);

export const formatRam = (v: number) => `${v}G`;

const sec = 1000;
const min = 60 * sec;
export const formatTime = (v: number) => {
  return `${Math.floor(v / min)}m${Math.floor((v % min) / sec)}s`;
};

export const formatPercent = (v: number) => `${formatFloat(v * 100)}%`;

export function getSchedule<T = any>(
  tasks: T[],
  getTime: (task: T) => number
): { tasks: [T, number][]; maxTime: number } {
  const WAIT_TIME = 50;

  let mapped: [T, number][] = tasks.map((t) => [t, getTime(t)]);
  const biggest = _.maxBy<any>(mapped, "1")[1];

  mapped = mapped.slice(0, Math.ceil(biggest / WAIT_TIME));

  const extra = mapped.length * WAIT_TIME;

  const maxTime: number = _.maxBy<any>(mapped, "1")[1] + extra;

  const total = mapped.length;

  const withTime: [T, number][] = mapped.map(([t, time], i) => [
    t,
    maxTime - (total - i) * WAIT_TIME - time,
  ]);

  const min = _.minBy<any>(withTime, "1")[1];
  const adjusted: [T, number][] = withTime.map(([t, time]) => [t, time - min]);

  return { tasks: adjusted, maxTime: maxTime - min - WAIT_TIME };
}

export interface Task {
  run: (delay: number) => void;
  time: number;
}

export async function schedule(ns: NS, tasks: Task[]) {
  const { tasks: schduledTasks, maxTime } = getSchedule(
    tasks,
    _.iteratee("time")
  );

  for (const [{ run }, startTime] of schduledTasks) {
    run(startTime);
  }

  await ns.asleep(maxTime);
}
