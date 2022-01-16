import { calcFunc } from "./controllerv3";
test("calcFunc", () => {
  console.log(calcFunc(200, 0.05, 4e-3));
  console.log(calcFunc(200, 0.05, 2e-3));
});
