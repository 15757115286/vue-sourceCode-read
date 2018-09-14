/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

//watcher的id，默认是从0开始的
let uid = 0

// 一个watcher的作用是解析一个表达式，收集依赖。当表达式的值发生变化的时候
// 激活回调函数。这个watcher将在$watch和directives的时候都会被用到
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  computed: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  dep: Dep;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  //这里对应vue api中的是vm.$watch(expOrFn,callback,[options])
  // 这个可以传递的五个参数分别是组件实例对象vm，要观察的表达式expOrFn，
  // 被观察的表达式的值变化的时候的回调函数cb，选项options和用来判断该
  // 观察者是否是渲染函数观察者字段的isRenderWatcher

  // 只有在mountComponent中创建的渲染函数观察者的isRenderWatcher这个参数才为真
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // vm._watcher是在initLifecycle的时候被初始化为null的
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // vm._watchers是一个数组，是在initState的时候被添加到vm上的
    // 在vm的观察者上面推入当前的wather实例。
    // vm._watchers会记录该组件实例的所有观察者，包括渲染函数观察者和非渲染函数观察者
    vm._watchers.push(this)
    
    // 这里处理传递进来的options
    // deep属性代表了是否深度观察
    // user属性代表了是开发者定义的还是内部定义的
    // computed属性用来标识当前观察者实例是否是计算属性观察者
    // sync属性用来告诉观察者是否同步求值并且执行回调
    // before是Watcher的实例钩子。当数据变化之后触发更新之前调用
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed
      this.sync = !!options.sync
      this.before = options.before
    } else {
      // 如果不存在opionts，那么将deep、user、computed、sync这四个参数都设置为false
      this.deep = this.user = this.computed = this.sync = false
    }

    // 指定当前watcher实例的回调对象为传入的回调函数
    this.cb = cb
    // 一个wacher的自增id,用来标识观察者实例对象的唯一性
    this.id = ++uid // uid for batching
    // 用来表示观察者对象是否激活，默认为激活状态
    this.active = true
    // 观察者实例的dirty的值和computed的值相同，因为计算属性是惰性求值的
    this.dirty = this.computed // for computed watchers

    //下面的deps,newDeps,depIds,newDepIds只是为了移除废弃的依赖使用

    // 记录了上次依赖收集的deps。表示了上次求值时候在deps内的所有依赖收集实例deps都会依赖于该watcher
    this.deps = []
    // 记录了本次依赖收集的deps。会在本次依赖收集完成以后把值赋值给deps然后清空
    // 表明了本次求实的时候有哪些dep实例依赖了该watcher
    this.newDeps = []
    // 记录了上次求值时候收集的dep的id。用来避免多次求值中收集重复的依赖
    this.depIds = new Set()
    // 记录了本次依赖收集中获取的所有dep的id。用来避免一次求值中收集重复的依赖
    // 会在依赖收集完成把值赋值给depIds然后自身清空
    this.newDepIds = new Set()

    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // 解析表达式或者函数
    // this.getter最终将会是一个函数，如果不是函数会在非生产环境产生告警信息
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    //这里如果是计算属性的观察者，会有额外的处理
    if (this.computed) {
      this.value = undefined
      this.dep = new Dep()
    } else {
      this.value = this.get()
    }
  }

  // 计算getter的值，并且重新获取依赖。这里的目的有2个，分别是求值和触发访问器属性的get拦截器函数
  // 触发get拦截器是收集依赖的关键
  get () {
    // 让当前的观察者成为被收集的观察者
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 我们把调用一个this.getter.call(vm,vm)看做一次依赖收集，因为这里会同步触发所有的
      // 在getter中访问的属性的get拦截器来收集这个watcher的依赖
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */

  // 添加依赖 
  addDep (dep: Dep) {
    // 获取收集依赖的Dep实例的id
    const id = dep.id

    // 这个if的代码块很关键，因为它的作用是用来避免收集重复的依赖
    // 如果我们在一个函数内部对同一个属性访问了多次，那么会多次调用get中的dep.denpend（）
    // 这里会导致dep.addSub(this)执行多次，收集了重复的依赖。这个函数在调用一次getter
    // 的时候可能会被执行多次

    // 在本次收集依赖的开始（调用this.getter函数），因为newDepIds和newDeps在开始前都会被清空
    // 如果某个依赖收集（dep）没有在本轮出现过，那么把id添加到newDepIds，把收集实例添加到newDeps
    // 表示了该次求值的时候有哪些dep依赖于这个watcher
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 如果收集依赖的dep在本次是没有出现过而且上次也没有收集过，那么把该watcher放入dep中
        dep.addSub(this)
      }
    }
  }

  // 清理相关的依赖
  cleanupDeps () {
    // 获取上次引用该watcher的所有依赖dep的长度
    let i = this.deps.length
    // 迭代所有的依赖，移除不需要该watcher的dep中收集的该watcher
    while (i--) {
      // 上次需要收集该依赖的dep
      const dep = this.deps[i]
      // 如果本次需要收集该wacher的依赖中没有该dep，就证明这个dep依赖已经不需要该watcher了
      // 就把这个watcher从该dep中移除掉
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 设置一个临时变量指向上次需要该wacher的dep的id集合this.depIds
    let tmp = this.depIds
    // 把本次的新的newDepIds赋值给depIds，以便在下次求值的时候可以获取到该watcher存在于哪些依赖dep中
    this.depIds = this.newDepIds
    // 把上次的depsId赋值给newDepIds并清空。
    this.newDepIds = tmp
    this.newDepIds.clear()

    // 把上次需要该watcher的引用赋值给临时变量
    tmp = this.deps
    // 把本次需要该watcher的deps的集合赋值给this.deps，以便在下次求值的时候可以确定当前时刻有哪些dep引用着该watcher
    this.deps = this.newDeps
    // 把原来的deps赋值给newDeps并清空
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  // 在依赖的值发生改变的时候会重新求值
  // 这里面分了3中情况，分别是该watcher是计算属性的watcher的时候
  // 第二种情况是是否是同步观察者
  // 第三种情况是是异步的观察者
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 如果该watcher处于活跃状态，那么调用该观察者实例的回调
  run () {
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }

  // 最终还是通过该函数来触发回调函数的。如果对于渲染函数来讲，这里的cb是noop函数，
  // 那么其实这里什么都不会做。因为对于渲染函数而言，它要做的收集依赖和更新DOM都在
  // updateComponent里面都做掉了
  getAndInvoke (cb: Function) {
    // 重新求值并且收集依赖。对于渲染函数来讲，重新求值其实等价于重新执行渲染函数，
    // 最终结果就是生成了虚拟DOM并更新了真实的DOM。实际上对于渲染函数来讲不会执行
    // if里面的内容，因为updateComponent没有返回值，所以返回的都是undefined
    const value = this.get()

    // 这里的if条件块是为非渲染函数准备的，如果两次求值不相等，会把新值和旧值一起传入
    // 回调函数。这也是我们平时常用的$watch
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // 用oldValue局部变量保存watcher上次的值
      const oldValue = this.value
      // 把本次求出的值赋值给watcher的value属性
      this.value = value
      // 用于计算函数的惰性求值。this.dirty为false证明计算函数已经求过值了
      this.dirty = false
      // 执行回调函数，把老值和新值一起作为参数传入，并把回调函数的this指向为vm
      if (this.user) {
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  evaluate () {
    if (this.dirty) {
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   */
  depend () {
    if (this.dep && Dep.target) {
      this.dep.depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
