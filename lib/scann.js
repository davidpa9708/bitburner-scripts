import { scanAll, formatMoney, formatTable, formatInteger, formatFloat, formatPercent, formatTime, } from "./shared.js";
const NAME = "scann";
const HELP = `
${NAME}

--filter text
--max-sec number
--min-money number
--min-hack-chance number
--desc-sec
--daemon
--help
--orgname

Example
  ${NAME} --sort
`;
const flags = [
    ["orgname", false],
    ["daemon", false],
    // ['deep', false],
    // ['sort', false],
    ["filter", ""],
    ["max-sec", Number.MAX_SAFE_INTEGER],
    ["min-money", 0],
    ["min-hack-chance", 0],
    ["desc-sec", false],
    ["help", false],
];
export function autocomplete(data) {
    data.flags(flags);
    return [...data.servers];
}
export async function main(ns) {
    const { daemon, 
    // sort,
    filter, ["max-sec"]: sec, ["min-hack-chance"]: minHackChance, ["min-money"]: money, ["desc-sec"]: descSec, orgname, help, } = ns.flags(flags);
    if (help) {
        ns.tprint(HELP);
        return;
    }
    ns.disableLog("sleep");
    const showInfo = () => {
        /** @type {string[]} */
        let hosts = scanAll(ns);
        let servers = hosts.map((host) => ns.getServer(host));
        // if (root)
        servers = servers.filter((server) => server.hasAdminRights);
        if (filter) {
            const regexp = new RegExp(filter, "i");
            servers = servers.filter((server) => server.hostname.match(regexp));
        }
        servers = servers.filter((server) => server.moneyAvailable >= money &&
            server.minDifficulty <= sec &&
            ns.hackAnalyzeChance(server.hostname) * 100 >= minHackChance);
        // if (sort)
        servers = servers.sort((a, b) => b.moneyMax - a.moneyMax);
        // servers = sortBy(servers, (v) => -v.requiredHackingSkill)
        if (descSec) {
            let prev = servers[0].hackDifficulty;
            servers = servers.filter((server, i, arr) => {
                if (i === 0)
                    return true;
                if (server.hackDifficulty < prev) {
                    prev = server.hackDifficulty;
                    return true;
                }
                return false;
            });
        }
        const headerInfo = {
            hostname: { name: "root" },
            moneyAvailable: { name: "money", format: formatMoney },
            moneyMax: { name: "total money", format: formatMoney },
            hackDifficulty: { name: "sec", format: formatFloat },
            minDifficulty: { name: "min sec", format: formatFloat },
            requiredHackingSkill: { name: "skill", format: formatInteger },
            hackChance: {
                name: "hack%",
                value: (server) => ns.hackAnalyzeChance(server.hostname),
                format: formatPercent,
            },
            hackTime: {
                value: (server) => ns.getHackTime(server.hostname),
                format: formatTime,
            },
            growTime: {
                value: (server) => ns.getGrowTime(server.hostname),
                format: formatTime,
            },
            weakenTime: {
                value: (server) => ns.getWeakenTime(server.hostname),
                format: formatTime,
            },
        };
        const defaultFormat = (v) => v.toString();
        /** @type {(keyof Server)[]} */
        const headers = [
            "hostname",
            "moneyAvailable",
            "moneyMax",
            "hackDifficulty",
            "minDifficulty",
            "requiredHackingSkill",
            "hackChance",
            "hackTime",
            "growTime",
            "weakenTime",
            "serverGrowth",
        ].filter(Boolean);
        return formatTable([headers.map((header) => headerInfo[header]?.name ?? header)].concat(servers.map((server) => headers.map((header) => (headerInfo[header]?.format ?? defaultFormat)(headerInfo[header]?.value?.(server) ?? server[header])))));
    };
    if (daemon) {
        ns.tail();
        while (true) {
            ns.print("\n", showInfo());
            await ns.sleep(10 * 1000);
        }
    }
    else {
        ns.tprint("\n", showInfo());
    }
}
