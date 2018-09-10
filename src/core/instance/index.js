import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

//给Vue.prototype._init赋值为一个函数
initMixin(Vue)
//stateMixin主要给Vue.prototype代理了2个访问描述符$data和$props
//然后定义了3个方法，分别是$set,$watch和$delete
stateMixin(Vue)
//给Vue.prototype定义了4个方法，分别是$on,$emit,$once,$off，这个vue中最常用的事件系统
eventsMixin(Vue)
//给Vue.prototype定义了3个方法，分别是_update,$forceUpdate和$destory3个方法
lifecycleMixin(Vue)
//给Vue.prototype定义了2个方法，分别是$nextTick和_render方法。然后使用installRenderHelpers函数对
//Vue.prototype进行了包装，加入了渲染帮助方法_o,_n,_s,_l...等方法
renderMixin(Vue)

export default Vue
