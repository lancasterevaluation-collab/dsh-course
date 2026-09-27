// 2.3 容器与依赖注入 · 作答模板
//
// 按 kit/CONTRACT-container.md 实现下列四个能力。每一处 TODO 都对应一条判据。
// 判分器会读这个文件的源码：只要还留着 TODO，整份实现按未作答记 0 分。

export function createContainer() {
  // TODO 1：登记表。同名可以注册多次，后者胜出。
  return {
    register(name, value) {
      // TODO 2：返回一个只能撤销这一次注册的句柄（含 name / token / dispose）。
      throw new Error('TODO 2：还没有实现 register')
    },

    resolve(name) {
      // TODO 3：解析同名的最新一次注册。
      throw new Error('TODO 3：还没有实现 resolve')
    },

    disposeAll(handles) {
      // TODO 4：按注册的逆序撤销，逐个捕获失败并汇总成 { succeeded, failures }。
      throw new Error('TODO 4：还没有实现 disposeAll')
    },
  }
}