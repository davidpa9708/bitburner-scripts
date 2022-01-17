export const HACK = 2e-3;
export const GROW = 4e-3;
export const WEAKEN = 0.05;
export const sumStats = (...args) => args.reduce((acc, next) => ({
  hack: acc.hack + (next?.hack || 0),
  grow: acc.grow + (next?.grow || 0),
  weaken: acc.weaken + (next?.weaken || 0)
}), { hack: 0, grow: 0, weaken: 0 });
function normalizeThreads({ hack, grow, weaken }, threads = 1) {
  const factor = threads / (hack + grow + weaken);
  return {
    hack: Math.floor(hack * factor),
    grow: Math.floor(grow * factor),
    weaken: Math.floor(weaken * factor)
  };
}
export class Server {
  expectedSecurity = 0;
  ns;
  hostname;
  constructor(ns, hostname) {
    this.ns = ns;
    this.hostname = hostname;
    this.expectedSecurity = this.security.actual;
  }
  get canHack() {
    return this.ns.getHackingLevel() >= this.ns.getServerRequiredHackingLevel(this.hostname);
  }
  get ram() {
    return this.ns.getServerMaxRam(this.hostname) - this.ns.getServerUsedRam(this.hostname);
  }
  get totalThreads() {
    return this.ram / this.ns.getScriptRam("grow.js", "home");
  }
  get root() {
    return this.ns.hasRootAccess(this.hostname);
  }
  get maxMoney() {
    return this.ns.getServerMaxMoney(this.hostname);
  }
  get money() {
    return this.ns.getServerMoneyAvailable(this.hostname);
  }
  get hack() {
    return {
      chance: this.ns.hackAnalyzeChance(this.hostname),
      increase: this.ns.hackAnalyze(this.hostname) + 1,
      time: this.ns.getHackTime(this.hostname),
      security: HACK
    };
  }
  get grow() {
    return {
      time: this.ns.getGrowTime(this.hostname),
      security: GROW
    };
  }
  get security() {
    const min = this.ns.getServerMinSecurityLevel(this.hostname);
    return {
      actual: this.ns.getServerSecurityLevel(this.hostname),
      min,
      remaining: Math.max(this.expectedSecurity - min, 0),
      max: 100
    };
  }
  get weaken() {
    const time = this.ns.getWeakenTime(this.hostname);
    return {
      time,
      totalThreads: Math.ceil(this.security.remaining / WEAKEN),
      security: -WEAKEN,
      delay: 0
    };
  }
  get sortFactor() {
    return this.hack.increase * this.hack.chance * this.maxMoney / this.weaken.time;
  }
  async doScript(script, server, _threads, delay) {
    const scriptFile = `${script}.js`;
    const threads = 1;
    const threadCount = Math.floor(_threads / threads);
    const scriptRam = this.ns.getScriptRam(script, "home");
    await this.ns.scp(scriptFile, "home", this.hostname);
    await this.ns.sleep(10);
    if (this.ram < scriptRam * threadCount || !Math.floor(threads) || !Math.floor(threadCount)) {
      return;
    }
    for (let thread = 0; thread < threads; thread++) {
      if (scriptRam * threadCount > this.ram && threads) {
        break;
      }
      const threadDelay = delay + thread * server[script].time / threads;
      this.ns.exec(scriptFile, this.hostname, threadCount, threadDelay, server.hostname);
      server.expectedSecurity += this[script].security * threadCount;
    }
  }
  async doThreads(server, threadStats, delay = 0, threads = 1) {
    let currentDelay = delay;
    let threadsRemaining = threads;
    const maxThreads = 100;
    while (threadsRemaining > 0) {
      const { hack, grow, weaken } = normalizeThreads(threadStats, Math.min(maxThreads, this.totalThreads));
      const hackDelay = server.weaken.time - server.hack.time;
      const growDelay = server.weaken.time - server.grow.time;
      await this.doScript("hack", server, hack, currentDelay + hackDelay);
      currentDelay += 200;
      threadsRemaining -= hack;
      await this.doScript("grow", server, grow, currentDelay + growDelay);
      currentDelay += 200;
      threadsRemaining -= grow;
      await this.doScript("weaken", server, weaken, currentDelay);
      currentDelay += 200;
      threadsRemaining -= weaken;
    }
    return delay;
  }
}
