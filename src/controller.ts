import {
  divideServersV2,
  getRootServers,
  formatTime,
  formatMoney,
  scanAll,
  runFull,
} from "./shared.js";

const flags: Flags = [
  ["daemon", false],
  ["weaken-ratio", 0.3],
  ["grow-ratio", 0.3],
  ["hack-ratio", 0.4],
  ["purchased", false],
  ["target", ""],
];

export function autocomplete(data: AutocompleteData) {
  data.flags(flags);
  return [...data.servers];
}

async function schedule(
  ns: NS,
  tasks: {
    name: string;
    run: (delay: number) => void;
    time: number;
  }[]
) {
  const WAIT_TIME = 100;
  const extra = tasks.length * WAIT_TIME;

  const maxTime = _.maxBy(tasks, "time")!.time + extra;

  const withTime = tasks.map(({ name, run, time }, i) => ({
    name,
    run,
    startTime: maxTime - i * extra - time,
  }));

  const sorted = _.sortBy(withTime, "startTime");

  for (const { run, startTime } of sorted) {
    run(startTime);
  }

  await ns.asleep(maxTime);

  // const clock = new Clock(ns, maxTime);
  // ns.print(`+starting`);
  // for (const { name, run, startTime } of sorted) {
  //   await clock.waitMark(startTime);
  //   ns.print(`-${name}`);
  //   run();
  //   await ns.asleep(WAIT_TIME);
  // }
  // await clock.waitAll();
  // ns.print(`+done`);
}

export async function main(ns: NS) {
  let { daemon, purchased, target } = ns.flags(flags);

  if (daemon) ns.tail();

  ns.disableLog("ALL");

  const controller = new Controller(ns);

  await controller.setup(
    purchased ? ns.getPurchasedServers() : getRootServers(ns)
  );

  ns.atExit(() => {
    controller.cleanup();
  });

  if (target) {
    while (true) {
      const maxMoney = ns.getServerMaxMoney(target);
      const minSec = ns.getServerMinSecurityLevel(target);

      const money = ns.getServerMoneyAvailable(target);
      const sec = ns.getServerSecurityLevel(target);
      ns.print(targetInfo(ns, target));

      if (sec > minSec + 5) await controller.weakenTarget(target);
      else if (money < maxMoney * 0.9) await controller.growTarget(target);
      else await controller.hackTarget(target);

      await ns.asleep(100); // always wait a bit just in case
    }
  } else {
    while (true) {
      const newTarget = getServerToHack(ns, { minMoney: 1_000_000 });
      if (newTarget) {
        ns.print(targetInfo(ns, newTarget));
        await controller.hackOnlyTarget(newTarget);
        await ns.asleep(100); // always wait a bit just in case
      } else {
        await ns.asleep(10_000);
      }
      await ns.asleep(100); // always wait a bit just in case
    }
  }
}

class Controller {
  static hackScript = "hack.js";
  static growScript = "grow.js";
  static weakenScript = "weaken.js";

  static files = [
    Controller.hackScript,
    Controller.growScript,
    Controller.weakenScript,
  ];

  static scriptTemplate = (action: string) => {
    return `
  const flags = [
  	['loop', false],
  	['delay', 0],
  ]

  export function autocomplete(data, args) {
  	data.flags(flags)
  	return [...data.servers]
  }

  /** @param {NS} ns */
  export async function main(ns) {
    const { _: [host], loop, delay } = ns.flags(flags)

    if (delay) await ns.sleep(delay)

  	if (loop)
      while (true) await ns.${action}(host)
    else await ns.${action}(host)
  }`;
  };

  servers: string[] = [];
  weakenCluster: string[] = [];
  weaken2Cluster: string[] = [];
  growCluster: string[] = [];
  hackCluster: string[] = [];

  constructor(public ns: NS) {}

  async setup(servers: string[]) {
    this.servers = servers;

    [
      this.weakenCluster,
      this.growCluster,
      this.hackCluster,
      this.weaken2Cluster,
    ] = divideServersV2(servers, 4, (host: string) =>
      this.ns.getServerMaxRam(host)
    );

    await this.ns.write("hack.js", Controller.scriptTemplate("hack"), "w");
    await this.ns.write("grow.js", Controller.scriptTemplate("grow"), "w");
    await this.ns.write("weaken.js", Controller.scriptTemplate("weaken"), "w");

    for (const server of servers) {
      await this.ns.scp(Controller.files, this.ns.getHostname(), server);
    }
  }

  cleanup() {
    this.servers.forEach((host) => this.ns.killall(host));
  }

  getRunner(cluster: string[], script: string, target: string) {
    return (delay: number) => {
      cluster.forEach((host) =>
        runFull(this.ns, script, host, target, "--delay", delay)
      );
    };
  }

  async weakenTarget(target: string) {
    const weakenTime = this.ns.getWeakenTime(target);

    this.ns.print(["weaken", `wTime: ${formatTime(weakenTime)}`].join(", "));

    await schedule(this.ns, [
      {
        name: "weaken",
        run: this.getRunner(
          [
            ...this.hackCluster,
            ...this.weakenCluster,
            ...this.growCluster,
            ...this.weaken2Cluster,
          ],
          Controller.weakenScript,
          target
        ),
        time: weakenTime,
      },
    ]);
  }

  async growTarget(target: string) {
    const weakenTime = this.ns.getWeakenTime(target);
    const growTime = this.ns.getGrowTime(target);

    this.ns.print(
      [
        "growing",
        `wTime: ${formatTime(weakenTime)}`,
        `gTime: ${formatTime(growTime)}`,
      ].join(", ")
    );

    await schedule(this.ns, [
      {
        name: "weaken",
        run: this.getRunner(
          [...this.weakenCluster, ...this.hackCluster],
          Controller.weakenScript,
          target
        ),
        time: weakenTime,
      },
      {
        name: "grow",
        run: this.getRunner(
          [...this.growCluster, ...this.weaken2Cluster],
          Controller.growScript,
          target
        ),
        time: growTime,
      },
    ]);
  }

  async hackTarget(target: string) {
    const weakenTime = this.ns.getWeakenTime(target);
    const growTime = this.ns.getGrowTime(target);
    const hackTime = this.ns.getHackTime(target);

    this.ns.print(
      [
        "hacking",
        `wTime: ${formatTime(weakenTime)}`,
        `gTime: ${formatTime(growTime)}`,
        `hTime: ${formatTime(hackTime)}`,
      ].join(", ")
    );

    await schedule(this.ns, [
      {
        name: "hack",
        run: this.getRunner(this.hackCluster, Controller.hackScript, target),
        time: hackTime,
      },
      {
        name: "weaken",
        run: this.getRunner(
          this.weakenCluster,
          Controller.weakenScript,
          target
        ),
        time: weakenTime,
      },
      {
        name: "grow",
        run: this.getRunner(this.growCluster, Controller.growScript, target),
        time: growTime,
      },
      {
        name: "weaken",
        run: this.getRunner(
          this.weaken2Cluster,
          Controller.weakenScript,
          target
        ),
        time: weakenTime,
      },
    ]);
  }

  async hackOnlyTarget(target: string) {
    const weakenTime = this.ns.getWeakenTime(target);
    const hackTime = this.ns.getHackTime(target);

    this.ns.print(
      [
        "hacking",
        `wTime: ${formatTime(weakenTime)}`,
        `hTime: ${formatTime(hackTime)}`,
      ].join(", ")
    );

    await schedule(this.ns, [
      {
        name: "hack",
        run: this.getRunner(
          [...this.hackCluster, ...this.growCluster],
          Controller.hackScript,
          target
        ),
        time: hackTime,
      },
      {
        name: "weaken",
        run: this.getRunner(
          [...this.weakenCluster, ...this.weaken2Cluster],
          Controller.weakenScript,
          target
        ),
        time: weakenTime,
      },
    ]);
  }
}

/** @returns Server with least money available to hack */
function getServerToHack(ns: NS, { minMoney = 1, skip = "" } = {}) {
  const servers = scanAll(ns);

  let serverToHack = null;
  let serverToHackMoney = Number.MAX_SAFE_INTEGER;

  for (const host of servers) {
    if (host === skip) continue;
    if (!ns.hasRootAccess(host)) continue;
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) continue;

    const money = ns.getServerMoneyAvailable(host);

    if (money < minMoney) continue;

    if (money < serverToHackMoney) {
      serverToHackMoney = money;
      serverToHack = host;
    }
  }

  return serverToHack;
}

function targetInfo(ns: NS, target: string) {
  const maxMoney = ns.getServerMaxMoney(target);
  const minSec = ns.getServerMinSecurityLevel(target);
  const money = ns.getServerMoneyAvailable(target);
  const sec = ns.getServerSecurityLevel(target);
  return [
    target,
    `Money: ${formatMoney(money)}/${formatMoney(maxMoney)}`,
    `Sec: ${sec}/${minSec}`,
  ].join(" | ");
}
