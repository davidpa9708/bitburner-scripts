export const HACK = 2e-3;
export const GROW = 4e-3;
export const WEAKEN = 0.05;
export const sumStats = (...args) => args.reduce((acc, next) => ({
  hack: acc.hack + (next?.hack || 0),
  grow: acc.grow + (next?.grow || 0),
  weaken: acc.weaken + (next?.weaken || 0)
}), { hack: 0, grow: 0, weaken: 0 });
function normalizeThreads(stats, threads = 1) {
  const factor = threads / (stats.hack + stats.grow + stats.weaken);
  const weaken = Math.min(Math.round(stats.weaken * factor), threads);
  const factor1 = (threads - weaken) / (stats.hack + stats.grow);
  const grow = Math.max(Math.round(stats.grow * factor1), 0);
  const hack = Math.max(threads - weaken - grow, 0);
  return {
    hack,
    grow,
    weaken
  };
}
export class Server {
  _expectedSecurity;
  ns;
  hostname;
  constructor(ns, hostname) {
    this.ns = ns;
    this.hostname = hostname;
    this._expectedSecurity = this.security.actual;
  }
  get expectedSecurity() {
    return this._expectedSecurity;
  }
  set expectedSecurity(newSecurity) {
    this._expectedSecurity = Math.min(Math.max(newSecurity, this.ns.getServerMinSecurityLevel(this.hostname)), 100);
  }
  get canHack() {
    return this.ns.getHackingLevel() >= this.ns.getServerRequiredHackingLevel(this.hostname);
  }
  get ram() {
    return this.ns.getServerMaxRam(this.hostname) - this.ns.getServerUsedRam(this.hostname);
  }
  get totalThreads() {
    return Math.floor(this.ram / this.ns.getScriptRam("grow.js", "home"));
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
  doScript(script, server, threads, delay) {
    const scriptFile = `${script}.js`;
    this.ns.exec(scriptFile, this.hostname, threads, delay, server.hostname);
    server.expectedSecurity += this[script].security * threads;
  }
  doThreads(server, threadStats, delay = 0, threads = 1) {
    let currentDelay = delay;
    const baseDelay = 20;
    const { hack, grow, weaken } = normalizeThreads(threadStats, Math.min(threads, this.totalThreads));
    const hackDelay = server.weaken.time - server.hack.time;
    const growDelay = server.weaken.time - server.grow.time;
    if (hack) {
      this.doScript("hack", server, hack, currentDelay + hackDelay);
      currentDelay += baseDelay;
    }
    if (grow) {
      this.doScript("grow", server, grow, currentDelay + growDelay);
      currentDelay += baseDelay;
    }
    if (weaken) {
      this.doScript("weaken", server, weaken, currentDelay);
      currentDelay += baseDelay;
    }
    return currentDelay;
  }
}
