type Flags = [string, any][];

declare const _: import("lodash")._;

interface AutocompleteData {
  flags(flags: Flags): void;
  servers: string[];
}

type Server = any;

interface Player {
  money: number;
}

/** @see https://github.com/danielyxie/bitburner/blob/dev/markdown/bitburner.ns.md */
interface NS {
  args: string[];

  hacknet: any;
  getHacknetMultipliers(): any;
  clearLog(): void;
  scan(host: string): string[];
  getHostname(): string;
  getServer(host: string): Server;
  getPlayer(): Player;

  write(
    handle: string,
    data?: string[] | number | string,
    mode?: "w" | "a"
  ): Promise<void>;

  flags(flags: Flags): any;
  atExit(cb: () => void): void;
  sleep(time: number): Promise<void>;
  asleep(time: number): Promise<void>;

  killall(host: string): void;
  tail(): void;

  print(...args: any[]): void;
  tprint(...args: any[]): void;
  enableLog(script: string): void;
  disableLog(script: string): void;

  getPurchasedServers(): string[];

  // hacking
  scp(file: string | string[], host: string, target: string): Promise<void>;
  exec(
    script: string,
    host: string,
    threads: number,
    ...args: (string | number)[]
  ): void;

  // info
  ls(hostname: string): string[];
  getHackingLevel(): number;

  // server ram
  getServerMaxRam(host: string): number;
  getServerUsedRam(host: string): number;
  getScriptRam(script: string, host: string): number;

  // server info
  hasRootAccess(host: string): boolean;

  getServerRequiredHackingLevel(host: string): number;

  getServerMoneyAvailable(host: string): number;
  getServerMaxMoney(host: string): number;

  getServerSecurityLevel(host: string): number;
  getServerMinSecurityLevel(host: string): number;

  getServerGrowth(host: string): number;

  getWeakenTime(host: string): number;
  getGrowTime(host: string): number;
  getHackTime(host: string): number;

  hackAnalyze(host: string): number;

  hackAnalyzeChance(host: string): number;

  hackAnalyzeThreads(host: string, hackAmount: number): number;
  growthAnalyze(host: string, growthAmount: number, cores?: number): number;
}
