// 2.4 事件与扩展点 · 作答模板
//
// 按 kit/CONTRACT-events.md 实现。判分器会读源码：只要还留着 TODO，整份按未作答记 0 分。

export function createBus() {
  // TODO 1：监听器表。同一事件可有多个监听器，各自带优先级与注册序号。
  return {
    on(event, listener, options) {
      // TODO 2：登记监听器，并返回一个幂等的取消函数。
      throw new Error('TODO 2：还没有实现 on')
    },

    emit(event, payload) {
      // TODO 3：广播。按优先级降序、同优先级按注册序调用，返回调用次数。
      throw new Error('TODO 3：还没有实现 emit')
    },

    waterfall(event, initial) {
      // TODO 4：接力。监听器签名 (value, next)；不调用 next 即短路。
      // TODO 5：返回 { value, completed }，completed 表示链路是否走完。
      throw new Error('TODO 4：还没有实现 waterfall')
    },
  }
}