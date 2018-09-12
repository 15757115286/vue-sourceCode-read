/* @flow */

// 该文件夹对应的是vue-api文档中的全局配置
import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
// performance测试性能的方法，仅在支持performance且开发环境下使用
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

//组件的唯一，每当新增一个组件的时候会自增1
let uid = 0

// initMixin函数主体
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // 这里的this是在new Vue里面调用的，所以this的值指向的是新创建的vue的instance
    const vm: Component = this
    // vue组件的自增uid，用来表示组件的唯一性
    vm._uid = uid++

    let startTag, endTag
    // 这里的performance对应的是vue-api中全局的config的performance，开启性能追踪:这里是性能测试开始
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 用来表明这是一个Vue实例，避免该对象被响应系统观测到
    vm._isVue = true
    // 合并参数，其中options是我们传入的参数，_isComponent是一个内部选项，只有Vue创建组件的时候才会拥有
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 如果不是以组件的形式（指的是没有_isComponent这个值）创建的话，那么会在vm实例上添加$options，等同于
      // vue api中的vm.$options.
      // mergeOption的主要功能就是将options中的data、props、computed、inject、provide、methods、自定义等等属性
      // 按照默认或者官方固定的或者自定义的方式进行合并，待以后使用。（这个字段是可以更改的）
      vm.$options = mergeOptions(
        //这里vm.constructor指的是vm实例的构造函数，一般指向Vue。但是Vue可以被继承，所以如果
        //使用 var Sub = Vue.extend(); var vm = new Sub(); 时候vm就指向的是Sub而不是Vue
        
        //这里第一个参数类似于Vue.options，第二个参数是我们传进来的参数，第三个是vm自身
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    // 在非生产环境下访问 vm 中属性如果不存在给出友好的提示（拦截的是 in 操作，但是可以拦截 with 下属性的访问）
    // 如果是在vue-loader的情况下拦截的是get操作，因为此时render中的_withStripped会被设置为true
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    // 把自己用_self字段暴露出来
    // 这里注意的是vm._self 和 vm._renderProxy是不同的。因为这两者的用途是不同的。
    // 并且vm._renderProxy可能是一个代理对象（通过new Proxy）
    vm._self = vm

    // 初始化声明周期，确定父子关系和添加相关属性，如$children、$parent和$refs等等
    initLifecycle(vm)

    // 初始化事件
    initEvents(vm)


    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    //性能测试结束
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

//这里返回的是一个options对象，类似于Vue.options这样子的，如果vm是由Vue的子类构造则会复杂许多
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  //下面的分支只有继承Vue的子类才有的属性
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
