/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 这里使用数组原型创建一个新的arrayMethods对象，这个对象可能会成为可观察数组的原型
// 而这个arrayProto中只会原型屏蔽掉可以改变数组内容的7个方法，另外的方法还是会通过
// 原型链去调用源生数组的方法，如slice foreach等等
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */

 // 这里拦截可以改变数组选项的方法并且触发事件
methodsToPatch.forEach(function (method) {
  // 这里用闭包缓存原始的数组方法
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    // 这里执行源生的数组操作
    const result = original.apply(this, args)
    // 这里数组的依赖是没有通过setter/getter去拦截的
    const ob = this.__ob__
    let inserted
    // 这里如果是push或者unshift方法，那么新增的内容就是args。
    // 如果是splice方法，那么新增的内容是就是数组的第二位及以后的数据
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }

    // 如果有inserted的值，那么这个值要么是源生的args，要么是通过args数组分割出来的
    // 所以说inserted的值如果存在就必定地数组
    if (inserted) ob.observeArray(inserted)

    // 因为调用了变异数组的方法，数组的结构改变，依赖的更新
    ob.dep.notify()
    // 返回源生数组方法操作后的结果
    return result
  })
})
