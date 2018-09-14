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
  // 补充：这个被必闭包reactiveGetter和reactiveSetter引用的依赖“框”只有当
  // 属性值被修改或者获取的时候用到
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
  // 补充：这里的childOb如果存在，那么收集到的依赖和常量dep的依赖是相同的。
  // 这里的作用是当使用Vue.set或者vm.$set的时候触发依赖
  let childOb = !shallow && observe(val)
  // 这里在vue通过getter进行依赖收集的时候预定义的所有对象和数组都已经创建了自己对象的dep
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // 这里的依赖是该属性的依赖，在属性的值改变的时候触发该依赖
        // 对象子属性的依赖父级一定可以收集到，因为通过调用a.b.c的时候首先会去访问b
        // 此时这个依赖会被b收集到，然后在调用b.c，依赖被c收集到
        dep.depend()
        if (childOb) {
          // 这里的childOb如果存在就是val.__ob.__，这里也需要收集依赖。
          // 因为如果没有源生的Proxy的话，那么vue是无法自动监听在对象上新增一个值的。
          // 所以这里收集依赖到childOb.dep里面，然后在Vue.set里面触发childOb.dep就可以
          // 这就是Vue.set或者$set可以在添加属性的同时触发依赖的原因

          // 但是需要注意的是如果此时的val是一个数组，那么childOb就是val.__ob__，这个值还有印象吗？
          // 没错，就是我们在改变数组内容的7个方法里面就是通过this.__ob__.dep.notify()来触发依赖的
          // 所以说我们对修改数组内容的依赖操作到这里就收集完成了

          // 这部操作也是为了Vue.set时候能够触发响应性所准备的。比如说有模板如下 {{ person.age }}
          // 此时data:{ person:{ name:'xwt' } }。渲染函数在获取依赖的时候首先取的是data.person，这
          // 个时候一切正常，因为person是响应性属性，此时依赖被收集到。在去获取age的时候，由于这个age
          // 原先在person上不存在，更谈不上响应性，所以依赖不会收集。我们在使用Vue.set(person,age,18)
          // 以后，set函数会响应person这个对象上的依赖。如果没有下面这一步，渲染函数仅仅只是被收集在了
          // person这个属性的闭包里面，无法再Vue.set的时候访问这个依赖，所以我们需要在下一步把这个渲染
          // 的依赖放置到childOb上面。这一步的操作只是为了在Vue.set触发对象不存在的属性的时候触发响应。
          // 当然数组所有的响应都是靠这个完成的（splice、push等方法）
          childOb.dep.depend()

          // 上面说到数组内容的改变的操作已经完成，那么下面的dependArray是干嘛的呢？

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
      // 如果这里的value是一个对象或者数组，那么只有当这个数组或者对象的指引改变的时候
      // 才会触发dep.notify，去触发依赖
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
 // 调用set的时候是触发target上的依赖而不是新增属性的依赖
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
  // 这里第二个条件就是我们不能对根数据通过Vue.set添加实例。因为根数据（$data）
  // 收集不到对应的依赖（没有使用defineReactive定义，在$data对象的属性发生变化的时候，
  // 由于没有childOp去收集对应的属性变化的依赖）-> $data的依赖只能是watch手动的添加。
  // 所以从设计上来说也是没有必要去动态的设置$data的属性，我们可以预先设置属性为null。
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
  // 比说说模板里面有一个引用一个data.name.xwt，但是xwt不存在data上面
  // 这时候因为xwt属性是不存在的，所以xwt属性无法收集属于自己的dep依赖
  // 但是，重点来了，有没有发现我们在访问xwt的前面首先访问了name?
  // 这里这个渲染函数的依赖同时被收集到了name.__ob__.dep里面了
  // 所以当我们通过Vue.set(name,'xwt','good')的时候触发了name上所有的依赖，此时当获取name.xwt
  // 的值的时候这个依赖也被name.xwt收集到，以后自己也是响应式了，真是棒棒的。
  // 所以页面上的data.name.xwt占位符会渲染为good，而通过data.name.xwt = 'bad'
  // 没有效果是因为那时候xwt是非响应性并且没有对象的属性依赖（通过Vue.set以后会重新生成自己的闭包属性依赖dep）
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

// 当数组被获取的时候我们队数组上的每一个元素进行依赖的收集，因为我们不能设置项属性拦截器的方式去访问数组的元素
// 这里面记得数组和对象处理的差异吗？如果是一个数组，那么我们只会通过迭代来对是对象或数组的数组项进行observe操作
// 但是如果是对象，那么会对对象的每一个property进行defineReactive操作，但是别忘记了，defineReactive也会进行observe操作的。
// 所以唯一的区别是数组无法通过像 array[0]这样的方式来收集依赖。
// 这里假设模板里面有这个一个 {{ array[0].name }}，但是此时我们array是这样的[{age:18,job:'vue'}]
// 首先我们假设不使用dependArray去对数组的每个项收集依赖会如何？
// 如果name一开始就存在于array[0]对象上那还好，因为对象每个属性都有着自己的依赖。当调用array[0].name = 'cm'
// 还是会自动触发响应的（因为依赖被收集在了自己的属性闭包的dep里面了）
// 但是这里的例子很遗憾，并没有name在array[0]上面。这个时候我们调用Vue.set(array[0],'name','xwt')来设置，
// 当设置好以后，vue要触发对应的渲染函数的依赖了，这个时候却发现在array[0]上压根没有任何依赖被收集，对应的依赖在array上面
// 因为渲染函数第一次收集依赖的时候，首先是data.array，没问题，array是响应式的，收集成功。当访问data.array[0]，抱歉，这里
// 数组的访问形式不会被拦截器拦截到，甚至说根本没有拦截器，所以array[0]上根本收集不到渲染函数这个依赖。但是这并不意味着
// array[0]上没有__ob__这个属性。这个属性是有的，因为array[0]是一个对象，在new Observe(array)的时候会通过observeArray(array)
// 为每一个array的item添加监听对象__ob__。只是仅仅无法通过array[0].name这样的方式去和name相关的渲染函数收集依赖到array[0]而已
// array自身的操作包括splice、push都是响应式的。
// 所以原因分析明白了，这个函数的作用自然就很清晰了，我们现在能确定的就是array是能够收集所有的依赖的，我把这里的依赖在分发给
// 我下面的每一个对象或者数组，记录在数组和对象的__ob__里面（不一定会用到，但肯定要用的时候会有）。如果是数组，在递归进行这个操作。
// 而且这一步的操作仅仅是为了预防数组中某个对象的值一开始不存在，后面通过Vue.set设置后无法触发响应的解决罢了
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
