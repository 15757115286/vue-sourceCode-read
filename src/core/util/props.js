/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

/**
 * 用来校验名字(key)给定的 prop 数据是否符合预期的类型，并返回相应 prop 的值(或默认值)
 * @param {*} key 需要检验的prop的名称
 * @param {*} propOptions 整个props选项对象，来源自vm.$options.props
 * @param {*} propsData 整个props数据来源，来源自vm.$options.propsData
 * @param {*} vm vm实例
 */
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  // 获取options中对应key的prop的内容，如{ type:Number ,required:true ,... }
  const prop = propOptions[key]
  // 代表某个prop是否存在存，如果为true则证明没有值传入
  const absent = !hasOwn(propsData, key)
  // 获取外界传入组件的对应的值
  let value = propsData[key]
  // boolean casting
  // 获取Boolean在指定类型数组的位置/是否存在（单一构造函数）
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 如果Boolean确实是期望的类型 这里是对Boolean类型的特殊处理
  if (booleanIndex > -1) {
    // 如果父组件中没有传值进来并且也没有指定默认的值
    if (absent && !hasOwn(prop, 'default')) {
      // 这里设置默认的值为false
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 如果传递进来的值是一个空字符串或者是一个用连字符连接的字符串（只包含小写字母）
      // 如果String不是预期类型或者String的优先级没有Boolean高（不太懂这里的操作有什么用）
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        // 把值默认设置为true
        value = true
      }
    }
  }
  // check default value
  // 如果此时value的值还是undefined
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.

    // 因为默认值是一个新的引用，所以需要把默认值设置为响应式的
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    // 做默认值真正的校检工作
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * 获取prop的默认值
 * @param {*} vm vm实例
 * @param {*} prop prop的定义，如{ type:Object,required:false,default:() => {} }
 * @param {*} key prop名称
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // 没有默认值，返回undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  // 获取prop中的默认值并且赋值给本地变量def
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 如果默认值是对象或者数组的话必须是用工厂模式提供的
  // 不然在非生产环境会产生告警
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 这段代码是为组件更新的时候准备的。
  // 当组件处于更新状态且没有传递该prop的值（如果有的话不会调用getPropDefaultValue），
  // 上一次组件更新或者创建的时候没有提供默认的prop值：vm.$options.propsData[key] === undefined
  // 因为在updateComponent中获取值是发生在重新复制propsData之前的
  // 上一次组件拥有一个部位undefined的默认值：vm._props[key] !== undefined
  // 那么直接返回上次组件时候的值。这么做的目的是因为对象和数组是通过工厂函数提供的，
  // 所以每次返回的值都是不一样的会导致触发无意义的响应
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 如果默认值为函数且期望的类型不是函数类型，那么此时证明这个函数是工厂函数，直接调用该工厂函数生成默认值
  // 如果不是函数，那么返回该值
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * 校检prop的值是否合法
 * @param {*} prop prop格式化后的内容
 * @param {*} name prop名称
 * @param {*} value prop的值
 * @param {*} vm vm实例
 * @param {*} absent 是否有传入值，true为缺失
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果prop是必须传入的但是却没有传入，则产生告警
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // 如果值为空并且该prop不是必须的，则返回，无需进行下面的验证
  if (value == null && !prop.required) {
    return
  }
  // 获取期望的类型
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
// 用函数名来判断内置对象的类型。返回函数名或者空字符串
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

// 判断两个函数是否是是相同的类型（根据函数名判断）
function isSameType (a, b) {
  return getType(a) === getType(b)
}

/**
 * 查找第一个参数所指定的类型构造函数是否存在于第二个参数所指定的类型构造函数数组中
 * 或者第一个参数指定的类型构造函数是否和第二个参数的构造函数类型相同
 * 如果存在则返回数组中对应的位置（不是数组则返回0），如果不存在则返回-1
 * @param {*} type 现有的类型
 * @param {*} expectedTypes 指定的类型
 */
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
