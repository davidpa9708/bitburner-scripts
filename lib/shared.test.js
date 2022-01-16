import { divideServersV2 } from "./shared";
import _ from "lodash";
beforeAll(() => {
    // @ts-ignore
    global._ = _;
});
it("divideServers", () => {
    const servers = [
        { name: "foo", value: 1 },
        { name: "bar", value: 1 },
        { name: "baz", value: 1 },
        { name: "bazz", value: 1 },
    ];
    const result = divideServersV2(servers, 3, (server) => server.value);
    console.log(result);
});
