/* @flow */

import config from '../config'
//引入观察者对象
import Watcher from '../observer/watcher'
import { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

//公共的defineProperty的属性
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 把target.sourceKey上面的的键值对代理到target上面
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 初始化vm的状态
export function initState (vm: Component) {

  // 首先往vm实例上面添加_watchers字段，初始值为一个数组
  vm._watchers = []

  // 获取已经经过mergeOptions处理过后的option
  const opts = vm.$options

  // 重点来了，我们在created中使用props的值是在这里加载的
  if (opts.props) initProps(vm, opts.props)

  // 重点来了，我们在created中使用methods的值是在这里加载的
  if (opts.methods) initMethods(vm, opts.methods)

  // 在这里初始化data的数据。因为initProps在initData之前，所以这就是为什么我们
  // 可以用props的值去初始化data的值的原因
  // 我们Vue实例中原型上的$data就是代理的vm._data这个值
  if (opts.data) {
    // 如果在vm.$options上存在data属性，那么使用initData方法去初始化vm的data
    initData(vm)
  } else {
    // 通过observe函数观测一个空对象，并把vm._data的值指向它
    observe(vm._data = {}, true /* asRootData */)
  }

  // 重点来了，我们在created中使用computed的值是在这里加载的
  if (opts.computed) initComputed(vm, opts.computed)

  // 重点来了，我们在created中使用watch的值是在这里加载的
  // 这里opts.watch !== nativeWatch是为了兼容Firefox游览器
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  // 获取合并属性上的data的值
  let data = vm.$options.data

  // 这里一般来说我们在mergeOption的时候已经把$options的处理成为一个函数了
  // 这里这么做的目的是因为beforeCreated函数是在mergeOptions之后且在initState函数之前
  // 调用的，因为vm.$options不是只读属性，如果在那个时候对vm.$options的值做出了修改，那么
  // 这里的判断是必须的

  // 我们通过getData函数拿到了最终的值并且赋值给了vm._data并且重写了data的值，此时data已经不是函数而是一个确切的值
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}

  // 如果拿到的值不是一个纯对象的话在非生产环境会产生告警，并且把data的值设置为一个空对象
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }

  // 在vm实例上代理data的值

  // 获取data上的属性名称
  const keys = Object.keys(data)

  // 获取props的属性名称
  const props = vm.$options.props

  // 获取methods的属性名称
  const methods = vm.$options.methods
  let i = keys.length

  // 这里检查data上的属性名称是否和props和methods中的冲突
  while (i--) {
    const key = keys[i]

    // 因为props、data、methods中的所有属性名都会被代理到vm实例上面去，所以这就硬性的规定了这几个对象里面
    // 不能有重名的属性。优先级是 props > data > methods
    // 如果一个属性在data中已经定义了，那么这个属性名就不能再methods中再去定义，否则在非生产环境会产生告警
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }

    // 如果一个属性名称已经在props中已经定义了，那么这个值就不能再data中再去使用，否则在非生产环境会产生告警
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 如果不是保留字（其实是符合不是_或者$开头的属性名），那么就把_data上的这个键值对代理到vm上面
      // 这里也提示了我们一点vue是不会代理_或者$开头的属性
      // 说白了就可以直接用 this.key 来获取 而不需要用 this._data.key 去获取值
      proxy(vm, `_data`, key)
    }
  }

  // 把最终的data（vm._data）对象变成一个可观察（响应式）的对象
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 防止使用 props 数据初始化 data 数据时收集冗余的依赖（摘自 —— Vue技术内幕） 
  pushTarget()
  try {
    // 调用并返回data执行后的值（data是我们在合并options时候生成的mergedInstanceDataFn或者mergedDataFn函数）
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { computed: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      return watcher.evaluate()
    }
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  //下面get和set方法中的this会被修正为Vue的实例vm
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  //在开发环境中会发出告警，表明$data和$props这两个Vue原型中的属性是只读的
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  //vue api中的vm.$set方法
  Vue.prototype.$set = set
  //vue api中的vm.$delete方法
  Vue.prototype.$delete = del

  //vue api中的vm.$watch方法
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      cb.call(vm, watcher.value)
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
