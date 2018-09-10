/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  //会在Vue构造函数上面挂载一个只读的config属性，记载了Vue的全局配置
  //如果试图去更改Vue.config,那么在开发环境下会给出对应的告警信息
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  //Vue.util为工具函数，但是不作为公共API，但是不要试图去依赖这些函数除非你能把握之中的风险
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  //给Vue构造函数添加set,delete和nextTick3个公共API
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  //给Vue构造函数添加了3个属性，分别是components,filters,directives。
  //这里可以猜测到这3个对象中存在的分别是全局组件，全局过滤器和全局指令
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  //这里把keep-alive内置组件混入到Vue.options.components中作为全局公共组件
  extend(Vue.options.components, builtInComponents)

  //这里加入了Vue中使用比较多的Vue.use公共API,看过源码以后才发现plugin自身也可以是一个函数去顶替plugin.install
  initUse(Vue)
  //在Vue中添加Vue.mixin公共API，Vue.mixin会把指定的对象混合到Vue.options上面
  initMixin(Vue)
  //在Vue中添加Vue.cid和Vue.extend公共API
  initExtend(Vue)
  //给Vue中添加Vue.componet,Vue.filter和Vue.directive3个公共API去定义全局的组件，过滤器和指令
  initAssetRegisters(Vue)
}
