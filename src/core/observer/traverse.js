/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

//递归的访问object中每一个属性去设置getters，这样可以让对象内部的每一个嵌套的属性的依赖可以被收集
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  //如果val不是数组或者对象，或者val是被冻结的，或者val是一个VNode数据类型就不会进行依赖收集
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // 如下代码格式：let a = {};let b = {};a.data = b;b.data = a;
  // 这段代码是避免响应式对象互相引用引起的死循环
  // 如果某个响应式的对象已经被遍历过了，那么下次
  // 在遇到这个对象的时候直接跳过
  // 但是如果我们在自己使用vm.$watch的时候被监测的expOrFn为一个函数，
  // 但是这个函数返回的不是一个响应式如上所示的互相引用的对象a，并且options
  // 中的deep为true，那么还是会引起死循环的
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  // 下面的操作会递归的调用_traverse(val[i],seen)
  // 和 _traverse(val[keys[i]], seen)，这里比较
  // 巧妙的是在递归的同时也进行了属性的读取，这也可,
  // 这也是让子属性有了依赖收集的机会
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
