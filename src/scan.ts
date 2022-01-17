const scripts = ["hack", "grow", "weaken"].map((s) => s + ".js");

/**
 * @param {NS} ns
 * @param {string} target
 * @param
 */
export function searchScan(
  ns: NS,
  search: string,
  searchFiles: boolean,
  target = ns.getHostname(),
  visited = new Set(),
  path: string[] = []
): string[] {
  visited.add(target);

  if (search) {
    const server = ns.getServer(target);
    Object.entries(server).forEach(([key, prop]) => {
      if (
        typeof prop === "string" &&
        prop.toLocaleLowerCase().match(search.toLocaleLowerCase())
      ) {
        ns.tprint([target, key, prop, path]);
      }
    });
  }

  if (searchFiles) {
    const files = (ns.ls(target) || []).filter(
      (file) =>
        !scripts.includes(file) &&
        (typeof search !== "string" ||
          file.toLowerCase().match(search.toLowerCase()))
    );
    if (files.length) {
      ns.tprint([target, files, path]);
    }
  }

  return ns
    .scan(target)
    .filter((child) => !visited.has(child))
    .flatMap((child) => [
      child,
      ...searchScan(ns, search, searchFiles, child, visited, [...path, child]),
    ]);
}

/** @param {NS} ns * */
export async function main(ns: NS) {
  ns.disableLog("ALL");
  ns.clearLog();
  const { search, ["search-files"]: searchFiles } = ns.flags([
    ["search", ""],
    ["search-files", false],
  ]);

  if (search || searchFiles) {
    searchScan(ns, search, searchFiles);
  }
}
