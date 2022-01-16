import { divideServersV2, getSchedule } from "./shared";
import _ from "lodash";
beforeAll(() => {
  global._ = _;
});
test("getSchedule", () => {
  console.log(getSchedule([400, 500, 600], _.identity));
  console.log(getSchedule([3, 1, 2], _.identity));
  console.log(getSchedule(_.range(10).map((i) => i % 2 ? 3100 : 2500), _.identity));
});
test.skip("divideServers", () => {
  const servers = [
    { name: "foo", value: 1 },
    { name: "bar", value: 1 },
    { name: "baz", value: 1 },
    { name: "bazz", value: 1 }
  ];
  const result = divideServersV2(servers, 3, (server) => server.value);
  console.log(result);
});
