/* @flow */

import config from '../config'
import { warn } from './debug'
import { nativeWatch } from './env'
import { set } from '../observer/index'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */

// Vue的合并策略，只能合并自定义的options属性，如果是像props,data等官方的属性是无效的。
// 即使在config.optionMergeStartegies中写入也会被覆盖掉
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */

 // 如果在生产环境中，因为缺失（如果不是人为定义）el和propsData的合并策略，还是会使用默认的合并策略
 // 这里的目的只是为了当vm不存在的时候产生一个告警提示而已
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

// 一个合并数据的帮助函数。如果目标对象中不存在指定对象中的属性，那么直接把该属性复制到目标对象
// 如果目标对象中存在指定对象中的值并且两个值都为纯对象，那么这这两个值在进行递归的合并，最后返回合并后的值
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal
  const keys = Object.keys(from)
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

// mergeDataOrFn函数永远只会返回函数
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 这里要明确一点，如果父选项和子选项中都没有属性，如data的时候，那么根本就不会去调用starts.data这个函数
    // 也就不存在调用mergeDataOrFn这个函数了。所以能调用这个函数的时候必定是子选项或者父选项中存在该属性
    // 在多重继承的时候会出现子选项中不存在data属性但父选项中出现data属性的情况

    // 如果能执行到这里，那么childVal的值必定是函数或者为空
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }

    // 如果合并的过程中2个选项中都有该属性，那么我们需要返回有一个可以返回经过
    // 2个选项函数处理合并后值的函数。这里不需要检查父选项的属性值是否为函数因为
    // 在经过之前合并的时候必定是函数了

    // 返回一个闭包，闭包中返回的是合并2个选项值中处理后的结果的值
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    // 如果是在 new 实例的时候的处理结果

    // 同样的也是返回一个闭包。因为这里的话对父选项和子选项值的类型要求没有限定
    // 所以先判定如果是函数的话就先执行让其返回结果。如果子选项的值（如果是函数则是执行后返回的值）存在的话就返回合并后的值
    // 否则返回父选项的值（如果是函数则是执行后返回的值）
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}


// 返回的策略为一个函数，函数执行以后还是返回一个合并了2个函数执行结果以后的函数。
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  //这面这个是处理子组件的代码
  if (!vm) {
    // 这里就说我们熟悉的提示当我们传入的options.data为不是函数的时候在定义子组件，这个时候会默认返回父选项的值
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    //如果传入的子选项的data为函数，那么会合并父选项和子选项data属性
    return mergeDataOrFn(parentVal, childVal)
  }
  //如果可以拿到vm则证明是在 new 操作符创建实例的时候调用的，这时候也返回mergeDataOrFn的结果，但是会多传一个vm参数
  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}

LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

//默认的合并策略，优先返回子选项的值，如果该值不存在，降为返回父选项的值
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}

//检查组件名是否合法。不能和内置标签冲突和必须要以字母开头只包含字母数字连字符
export function validateComponentName (name: string) {
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'can only contain alphanumeric characters and the hyphen, ' +
      'and must start with a letter.'
    )
  }
  //isBuildInTag检查是否和slot和component这两个冲突
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}


//让props语法序列化成基于对象的格式
//这里貌似之前的 props:{test:Number}这样的类型验证失效，被规范为props:{test:{type:null}}
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  //如果选项中有props这个值，不管什么类型最后都会被转化为object
  const res = {}
  let i, val, name
  //props可以是一个数组，但是数组中只能是字符创。并且通过'-'链接的字符串会变成驼峰式的。默认的type为null
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    //如果对象是严格的object类型并且值也是严格的object类型就会把值赋值给res[key]。
    //如果值不会严格对象类型处理和数组相同。同样也会驼峰式键名 
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    //在非生产环境下会产生友好的提示 
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  //把最终的结果赋值给options
  options.props = res
}

//将自动注入的内容也变成基于对象格式的，from是用来搜索provider中值的最终键名
//对象的语法可以使得我们设置一个别名和一个默认的值
function normalizeInject (options: Object, vm: ?Component) {
  //如果没有inject属性就直接返回
  const inject = options.inject
  if (!inject) return

  //最终被转化完成的inject对象
  const normalized = options.inject = {}

  //如果inject是数组格式的，那么会被转成{ key : { from : key }, ...}的形式。key为数组中的每个选项
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    //如果inject是纯对象的格式，如果值也是纯对象，那么会在值上面添加一个from的字段（如果之前的值没有该字段）并添加到最终的结果。
    //如果值不是纯对象的话处理的方式和数组相同。可能的值为{ key : { from:'xxx' , default:'xxx' } }
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    //在非生产环境下会给出友好的提示
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

//格式化原生的指令函数变成对象格式
//一般来说定义的指令的值为一个对象，其中包括了bind、inserted、update、componentUpdate、unbind这几个钩子函数
//但是这里同样指令的值可以为一个函数，这种情况下默认会添加bind和update2个钩子函数
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */

//这个函数处理的最终结果会影响到child，但是不会影响到parent
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  //在非生产环境下进行标签监测
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child)
  }

  //同样可以合并通过继承Vue的子类的参数
  if (typeof child === 'function') {
    child = child.options
  }

  //适配器模式去处理options中的props和inject和directives等

  //下面3个函数统一的格式化了props,directives和inject的多元化写法为对象格式的写法，可以借鉴这种设计模式
  //具体的注释在对应的函数内
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)


  //下面的代码是处理extends和mixins两个选项的

  const extendsFrom = child.extends
  if (extendsFrom) {
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  if (child.mixins) {
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  //最终返回的合并的结果
  const options = {}
  //这里的key指的是选项中类似components,filters,directives这样的属性
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  //如果key的值为data的话（options.data），那么其值为函数并没执行
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
