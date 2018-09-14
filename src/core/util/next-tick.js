/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
let pending = false

function flushCallbacks () {
  // 将pending设置为false，表明又可以把flushCallbacks推入游览器任务队列中
  pending = false
  // 这里用copies变量缓存了callbacks，然后在清空callbacks数组
  // 这样做的目的是：在外层 $nextTick 方法的回调函数中再次调用了 $nextTick 方法，
  // 理论上外层 $nextTick 方法的回调函数不应该与内层 $nextTick 方法的回调函数在同
  // 一个 microtask 任务中被执行，而是两个不同的 microtask 任务，虽然在结果上看或
  // 许没什么差别，但从设计角度就应该这么做。（ 摘自 —— Vue技术内幕 ）
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc
let macroTimerFunc
let useMacroTask = false

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */

// macroTimerFunc的作用就是将flushCallbacks这个函数推入macroTask中，仅此而已
// 方法实现之间的差劲区别仅仅是在于性能

// 这里如果存在setImmediate的话，首选setImmediate。因为这个的性能比setTimeout
// 要好，因为setTimeout会不停的做超时检查。
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  // 这里也是用到了MessageChannel的hack。类似于WebWoker的管道，因为这个
  // 也不需要做超时检测，所以性能也要由于setTimeout
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  // setTimeout是最为最后的备选方案
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */

// 使用游览器源生的Promise来把任务推入到microTask
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else {
  // 如果游览器不存在源生的Promise，那么降级为把任务推入到macroTask
  microTimerFunc = macroTimerFunc
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

export function nextTick (cb?: Function, ctx?: Object) {
  // 当没有回调的时候并且存在Promise的时候，_resolve局部变量记载了Promise内部的resolve函数
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        // 如果有回调则执行回调
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 如果_resolve存在则证明没有回调函数，那么执行_resolve函数，后续会执行用户自己定义的Promise.then中的回调
      _resolve(ctx)
    }
  })

  // pending字段表明了flushCallbacks是否已经推入任务队列。在执行flushCallbacks之后这个值又变成false
  if (!pending) {
    // pending字段边成true，以为着当任务队列执行之前，无论调用多少次nextTick，都只会将任务队列推入一遍
    pending = true
    // 根据useMacroTask变量决定将flushCallbacks推入宏观任务队列或者微观任务队列
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      // 将Promise内部的resolve函数赋值给nextTick函数作用域变量_resolve
      _resolve = resolve
    })
  }
}
