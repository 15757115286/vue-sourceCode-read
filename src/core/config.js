/* @flow */

// shared/util这个js文件是一些公共的方法，如isObject等，详细请参见具体文件
import {
  no,
  noop,
  identity
} from 'shared/util'

//Vue的生命周期钩子
import { LIFECYCLE_HOOKS } from 'shared/constants'

//flow的type声明
export type Config = {
  // user
  optionMergeStrategies: { [key: string]: Function };
  silent: boolean;
  productionTip: boolean;
  performance: boolean;
  devtools: boolean;
  errorHandler: ?(err: Error, vm: Component, info: string) => void;
  warnHandler: ?(msg: string, vm: Component, trace: string) => void;
  ignoredElements: Array<string | RegExp>;
  keyCodes: { [key: string]: number | Array<number> };

  // platform
  isReservedTag: (x?: string) => boolean;
  isReservedAttr: (x?: string) => boolean;
  parsePlatformTagName: (x: string) => string;
  isUnknownElement: (x?: string) => boolean;
  getTagNamespace: (x?: string) => string | void;
  mustUseProp: (tag: string, type: ?string, name: string) => boolean;

  // private
  async: boolean;

  // legacy
  _lifecycleHooks: Array<string>;
};

export default ({
  //Vue的自定义合并策略
  optionMergeStrategies: Object.create(null),

  //是否抑制告警
  silent: false,

  //设置为false阻止vue在启动时候自动生成提示
  productionTip: process.env.NODE_ENV !== 'production',

  //是否允许vue-devtools检查代码，需要在加载Vue之后立即同步设置
  devtools: process.env.NODE_ENV !== 'production',

  //性能追踪
  performance: false,

  //捕获Vue声明周期函数和自定义事件函数内部错误
  errorHandler: null,

  /**
   * Warn handler for watcher warns
   */
  warnHandler: null,

  //忽略Vue之外的自定义元素
  ignoredElements: [],

  //自定义键位别名
  keyCodes: Object.create(null),

  /**
   * Check if a tag is reserved so that it cannot be registered as a
   * component. This is platform-dependent and may be overwritten.
   */
  isReservedTag: no,

  /**
   * Check if an attribute is reserved so that it cannot be used as a component
   * prop. This is platform-dependent and may be overwritten.
   */
  isReservedAttr: no,

  /**
   * Check if a tag is an unknown element.
   * Platform-dependent.
   */
  isUnknownElement: no,

  /**
   * Get the namespace of an element
   */
  getTagNamespace: noop,

  /**
   * Parse the real tag name for the specific platform.
   */
  parsePlatformTagName: identity,

  /**
   * Check if an attribute must be bound using property, e.g. value
   * Platform-dependent.
   */
  mustUseProp: no,

  /**
   * Perform updates asynchronously. Intended to be used by Vue Test Utils
   * This will significantly reduce performance if set to false.
   */
  async: true,

  /**
   * Exposed for legacy reasons
   */
  _lifecycleHooks: LIFECYCLE_HOOKS
}: Config)
