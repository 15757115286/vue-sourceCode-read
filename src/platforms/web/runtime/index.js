/* @flow */

//Vue存在于core文件夹下面，core文件夹下的代码和vue的核心代码，与平台无关的代码
//Vue的过程总结起来就是在core/index下面进行了Vue构造函数自身公共函数的定义和config的设置
//然后在core/instance/index 下面进行Vue.prototype的方法定义
import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser, isChrome } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'

// 给Vue.config加载平台指定的工具，覆盖config中的初始化的配置
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// 加载平台运行时的内置指令和组件（根据平台的不同而加载不同的内容）
// 加载了web平台全局内置指令show 和modal
extend(Vue.options.directives, platformDirectives)
// 加载了web平台全局内置组件transition和transition-group
extend(Vue.options.components, platformComponents)

// 如果是在游览器运行环境下给Vue.prototype.__patch__赋值为patch函数
Vue.prototype.__patch__ = inBrowser ? patch : noop

// 添加著名的Vue.prototype.$mount方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}

//该devtools的钩子函数存在于游览器下window.__VUE_DEVTOOLS_GLOBAL_HOOK__（不一定有该函数）
//如果存在该钩子函数并且config中开启了config.devtools代码检查，则触发钩子函数进行代码检查，否则打印出vue-devtools的下载地址
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test' &&
        isChrome
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
