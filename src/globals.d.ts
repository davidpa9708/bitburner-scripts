/** @see https://github.com/danielyxie/bitburner/blob/dev/markdown/bitburner.ns.md */
interface NS {
  scan(host: string): string[];
  getHostname(): string;

  killall(host: string): void;

  // printing
  print(text: string): void;

  // hacking
  exec(script: string, host: string, threads: number, ...args: string[]): void;

  // server ram
  getServerMaxRam(host: string): number;
  getServerUsedRam(host: string): number;
  getScriptRam(host: string): number;
}
