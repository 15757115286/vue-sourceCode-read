/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

// 这里arrayKeys的值位一个数组，包含了以下的内容
// push pop shift unshift sort reserve splice 这7个可以改变数组内容的方法名
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */

// 这里的value应该是一个对象或者是一个数组 
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    this.value = value
    // 定义一个收集依赖的框
    this.dep = new Dep()
    this.vmCount = 0
    // 定义一个不可枚举的__ob__属性
    def(value, '__ob__', this)
    if (Array.isArray(value)) {

      // hasProto是指对象是否可以直接获取自己的原型链 __proto__

      // 这里的区别就是如果可以使用 __proto__ 去改变原型链的话，
      // 那么直接把数组array的原型链指向arrayMethods（一个对象，该对象的原型链还是数组的原型，
      // 但是对象中有7个可以改变数组属性的方法覆盖掉了数组原型链中的方法）

      // 如果不能使用__proto__改变原型链的话，就把arrayMethods中的重写过的7个可以改变数组内容的方法代理到value数组上
      // 并原型链屏蔽掉数组原型中的方法（如push、pop、splice等）
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

 
  // 遍历对象中的每个属性去把它转化成getter/setter的形式。
  // 这个方法只有当obj为对象的时候才应当被调用
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  // 尝试把数组中的每项都去创建一个可观察对象
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}


// 如果可以使用__proto__的话，把__proto__指向src来改变target的原型链
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

// 用迭代的形式把src中存在于keys中的所有key的内容都代理到target上，并且这些值都是不可枚举的
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}


 // 尝试为一个值去创建一个可观察的对象。如果创建成功则返回新建的可观察对象。
 // 如果value中已经存在一个可观察对象则返回该可观察对象
export function observe (value: any, asRootData: ?boolean): Observer | void {

  // 如果不是对象或者该value是一个VNode实例，那么直接返回
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果value自身中已经存在一个Observer类型的__ob__，那么ob就直接为__ob__
  // 这里主要的作用是避免重复观测一个数据对象
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // 否则的话，如果shouldObserve并且不是服务端渲染并且value是一个数组或者一个可扩展的不是Vue实例的纯对象
    // 就新建一个可观察的实例

    // 这里的shouldObserve相当于是一个开关，可以动态的改变我们的对象是否是可观测的。因为在某些情况下我们需要
    // value是不可观测的
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }

  // 如果是根元素并且有观察对象，那么vmCount值加1
  if (asRootData && ob) {
    ob.vmCount++
  }

  // 返回可观察对象ob
  return ob
}

// 在一个对象中定义一个响应式的属性
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  // 获取对象中对应属性的描述符
  const property = Object.getOwnPropertyDescriptor(obj, key)

  // 如果可以获取到属性的描述符并且该属性是不可配置，那么直接返回
  // 这里也是为什么vue api中说明了如果一个对象使不可配置的，那么不会有响应性
  if (property && property.configurable === false) {
    return
  }

  // 这里暂存对应属性的set和get
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
