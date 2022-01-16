import { calcFunc } from "./controllerv3";

test("calcFunc", () => {
  console.log(calcFunc(200, 0.05, 0.004));
  console.log(calcFunc(200, 0.05, 0.002));
});
