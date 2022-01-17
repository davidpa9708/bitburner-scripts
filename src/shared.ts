export function daemon(ns: NS, forceTrue: boolean) {
  const { daemon } = ns.flags([["daemon", false]]);
  if (daemon || forceTrue) {
    ns.tail();
  }
}

export async function ftry(fn: () => any) {
  try {
    const result = await fn();
    return result;
  } catch (err) {
    return null;
  }
}

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
