import { daemon } from "shared.js";
const MAGIC_NUMBER = 1.0173494974687902;

const waitDuration = 5;

function getMoney({
  level,
  ram,
  cores,
}: {
  level: number;
  ram: number;
  cores: number;
}) {
  return (MAGIC_NUMBER ** (ram * 2 - 2) * level * (cores + 5)) / 4;
}

/** @param {NS} ns * */
export async function main(ns: NS) {
  const duration = 10;
  // 5 { duration } = ns.flags([["duration", 2]]);
  ns.disableLog("sleep");
  daemon(ns, false);
  const wait = async () => ns.sleep(waitDuration * 1000);
  while (true) {
    const nodeCount = ns.hacknet.numNodes();
    const balance = ns.getServerMoneyAvailable("home");
    let bestNode = 0;
    let bestUpgradePath: "level" | "cores" | "ram" = "level";
    let bestRelativeCost = 0;
    let upgradeLevel = 0;
    let bestUpgradeGain = 0;
    let bestUpgradeCost = 0;

    const upgradeCosts = {
      level: ns.hacknet.getLevelUpgradeCost,
      ram: ns.hacknet.getRamUpgradeCost,
      cores: ns.hacknet.getCoreUpgradeCost,
    };

    const _multiplayers = ns.getHacknetMultipliers();
    const multiplayers = {
      level: _multiplayers.levelCost,
      ram: _multiplayers.ramCost,
      cores: _multiplayers.coreCost,
      node: _multiplayers.purchaseCost,
      production: _multiplayers.production,
    };

    for (let i = 0; i < nodeCount; i++) {
      const stats = ns.hacknet.getNodeStats(i);
      const { level, cores, ram } = stats;
      const node = { level, cores, ram };
      const currentMoney = getMoney(node);

      (["level", "cores", "ram"] as const).forEach((path) => {
        const upgradeCost = upgradeCosts[path](i) * multiplayers[path];
        const nextStat = (() => {
          if (path === "ram") {
            return ram * 2;
          }
          return node[path] + 1;
        })();
        const newMoney = getMoney({ ...node, [path]: nextStat });
        const moneyGain = newMoney - currentMoney;
        const relativeCost = moneyGain / upgradeCost;
        if (bestRelativeCost < relativeCost) {
          bestNode = i;
          bestUpgradePath = path;
          bestRelativeCost = relativeCost;
          bestUpgradeGain = moneyGain;
          bestUpgradeCost = upgradeCost;
          upgradeLevel = nextStat;
        }
      });
    }
    const nodeCost = ns.hacknet.getPurchaseNodeCost();
    if (bestUpgradeCost / bestUpgradeGain / 60 / 60 >= duration) {
      break;
    }
    if (bestUpgradeCost >= nodeCost) {
      if (nodeCost <= balance) {
        if (ns.hacknet.purchaseNode()) {
          ns.print(`purchased node ${nodeCount}`);
          continue;
        }
      }
      ns.print(`not enough balance to purchase node ${nodeCount}`);
      continue;
    }
    if (balance > upgradeCosts[bestUpgradePath](bestNode)) {
      const result = {
        level: ns.hacknet.upgradeLevel,
        ram: ns.hacknet.upgradeRam,
        cores: ns.hacknet.upgradeCore,
      }[bestUpgradePath](bestNode);
      if (result) {
        ns.print(
          `upgraded node ${bestNode} ${bestUpgradePath} to ${upgradeLevel}`
        );
        continue;
      }
      ns.print(
        `Error, cannot upgraded node ${bestNode} ${bestUpgradePath} to ${upgradeLevel}`
      );
      await wait();
    } else {
      ns.print(
        `not enough balance to upgraded node ${bestNode} ${bestUpgradePath} to ${upgradeLevel}`
      );
      await wait();
    }
    await ns.sleep(100);
  }
}
