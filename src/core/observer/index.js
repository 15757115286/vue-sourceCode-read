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

// 这里的value应该是一个对象或者是一个数组，在value里面添加一个不可枚举的__ob__属性 
// 这里的大致流程就是如果被观测的value是一个数组，那么重写数组的7个可以改变数组内容的方法
// 然后再去递归的去尝试为数组项中是对象或者数组的项创建响应式对象
// 如果value是对象，那么使用defineReactive去为把对象中的每个property定义为响应式属性
// 然后使用walk递归的去尝试把是对象或者数组的属性定创建可观察对象
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    // 这个value就是被观察的对象（数组或者对象）
    this.value = value
    // 定义一个收集依赖的框
    this.dep = new Dep()
    // 新创建的可观察对象的vmCount被初始化为0
    this.vmCount = 0
    // 定义一个不可枚举的__ob__属性，并把自身赋值为该值
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
      // 尝试去为数组中的每一项去创建一个可观察属性
      this.observeArray(value)
    } else {
      // 把对象中的属性定义为响应式属性，并为每个值为数组或者对象的属性创建可观察对象
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
 // 用来响应vm.$options.data（合并后的data）就是在这里被处理成响应式的
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
    // 在调用new Observer(value)的时候会在value上添加__ob__字段来指向ob
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
  // vue中把手机的依赖dep放在闭包中定义为私有变量，没有公开开放
  // 每一个字段都通过闭包引用着属于自己的dep常量
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

  // 如果某个属性定义了setter，或者没有定义getter并且值传递了2个参数
  // 这种情况就是证明没有传递初始化的val的值，需要我们主动通过key去获取obj对象中key的值

  // 这里面如果用户定义了getter，那么这里就不进行深度观察，因为可能有意想不到的意外。
  // 后面的setter存在还是会进行深度观察是因为我们在属性的值发生改变的时候会取setter返回的值，
  // 然后在深度观测这个返回的值。但是之前我们如果有getter的话就不会进行深度观测，这两个行为没有一致性
  // 所以如果存在getter并且同时存在setter的话这里vue还是户深度观察（摘自 —— vue技术内幕）
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 这里的val只有当满足上述的条件后才会触发取值的动作，所有val未必是会有值的。
  // 所以在不满足条件的时候的时候val的值依旧可能回事undefined，这就会导致深度观测无效
  // （摘自 —— vue技术内幕）

  // 闭包里面引用的childOb可观测对象就是obj[key].__ob__（如果有的话）
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // 这里的依赖是改属性的依赖，在属性的值改变的时候触发该依赖
        dep.depend()
        if (childOb) {
          // 这里的childOb如果存在就是val.__ob.__，这里也需要收集依赖。
          // 因为如果没有源生的Proxy的话，那么vue是无法自动监听在对象上新增一个值的。
          // 所以这里收集依赖到childOb.dep里面，然后在Vue.set里面触发childOb.dep就可以
          // 这就是Vue.set或者$set可以在添加属性的同时触发依赖的原因
          childOb.dep.depend()

          // 这里因为依赖了一个数组，所以说就等于依赖了数组中的每一项。因为数组的访问是没有拦截器的，
          // 所以我们需要动过手动的去dependArray的方式去将这个对应的依赖添加到数组的每一项的依赖中去
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }

      // 因为是getter拦截器，所以这里必须得返回值，不然都是undefined
      return value
    },
    set: function reactiveSetter (newVal) {
      // 这一步的作用是获取到属性原有的值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 这一步是与原值作比较，如果新的值和老的值相等（或者两个值都为NaN）
      // 那么这里直接返回，并且不需要触发依赖
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      // 在非生产环境下这个函数的作用只是打印一些辅助的信息用的
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }

      // 如果setter存在的话，那么就用原有的setter来设置属性的值
      // 否则的话就用newVal去赋值val。
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }

      // 这里如果需要深度观察的话，尝试着为新的值去创建一个观测对象
      // 并更新childOb的指引
      childOb = !shallow && observe(newVal)
      // 触发依赖
      dep.notify()
    }
  })
}


 // vue无法检测到一个对象的属性新增，为了解决这一困扰，新增Vue.set方法
 // 在一个对象上设置一个属性。如果这个属性不存在对象上那么新增这个属性并且触发依赖
export function set (target: Array<any> | Object, key: any, val: any): any {

  // 在非生产环境下如果设置的对象是undefined、null、或者基本类型，那么会产生告警。
  // 这么做是合理的，因为set只能对数组或者对象添加属性
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 如果是数组并且我们设置的key是一个合法的数组下标
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 我们先把素组的长度更改为当前长度和修改的key的长度，否则当key大于length的时候splice是无效的。
    // 会直接往数组当前的length后面添加内容而不是指定的位置
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }

  // 如果属性已经在对象中定义了，那么直接赋值就行了，会自动触发响应式。
  // 但是为什么不用hasOwn(target,key)去判断呢？之前的vue是这么判断的，
  // 具体原因参考https://github.com/vuejs/vue/issues/6845
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  // 第一个条件的意义是避免给Vue实例本身添加观测对象
  // 这里我们只有在对options.data进行observe的时候才会将asRootData设置为true
  // 这里第二个条件就是我们不能对根数据通过Vue.set添加实例。因为根数据不是一个
  // 响应式的字段（没有使用defineReactive定义），所以说不可能触发响应的。
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }

  // 如果添加的对象本身就不是响应式的，那么直接在对象上添加属性就行
  if (!ob) {
    target[key] = val
    return val
  }

  // 如果对象是响应式的，那么就为对象添加属性，并触发依赖
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

// 从对象中删除一个元素并且如果有必要的话触发响应
export function del (target: Array<any> | Object, key: any) {

  // 如果是基本属性的话，那么在非生产环境抛出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 如果是数组的话，那么直接让splice来代理该操作
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__

  // 这个理由同set
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 如果对象上没有该属性，直接返回
  if (!hasOwn(target, key)) {
    return
  }

  // 如果对象上有该属性，删除该属性
  delete target[key]

  // 如果不是响应式的对象，返回
  if (!ob) {
    return
  }

  // 触发响应
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
