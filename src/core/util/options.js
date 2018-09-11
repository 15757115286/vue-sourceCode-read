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
    // 这里要明确一点，如果父选项和子选项中都没有属性，如data的时候，那么根本就不会去调用strats.data这个函数
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

      //在调用函数childVal的时候传入一个参数，指向vm本身，并且函数调用时候this也是指向vm的
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

 // 这里有parentVal的话一定会是数组格式的。parentVal一般是从构造函数,例如Vue或者Vue的子类中的options里面的
 // 它会在Vue.extend中mergeOptions中被处理成为数组。如果parentVal不存在，那么strats[hooks] 函数根本不会执行
 // 从这里可以发现我们在组件中写生命周期的钩子可以是数组形式的，它会按序一个个执行下去
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

//给合并策略添加每个生命周期的合并函数，每个函数都相同，都是mergeHook
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})


 // 一般Vue中会把组件、指令和过滤器称作为资源
 // 合并资源，当一个vm被创建的时候我们需要进行对构造函数的options，实例自身的options和上级的options
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 这里如果存在parentVal的话（通过Vue.component等创建的全局的组件或者指令）-> 正是因为有这个mergeAssets才可以全局注册
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    // 感觉这种混合方式比较好，没有用到递归去混合，而是通过原型链屏蔽的方式去混合对象。但是子类的同名属性会屏蔽掉原型链上父类的属性
    return extend(res, childVal)
  } else {
    return res
  }
}

// 给 filters、components、directives添加合并策略，合并策略函数都是mergeAssets
// 添加策略 strates.filters、strats.components、strats.directives 
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */

 // 同样的这里watch的写法中如果parentVal和childVal都存在那么到最后观察的字段的回调都会被处理成为一个数组，包含着这些回调函数
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {

  // 下面两句是为了兼容火狐游览器的。因为火狐游览器在Object.prototype中会有一个watch
  // 所以如果parentVal或者childValue中和源生的nativeWathc相等的话，就是证明parentVal和childVal是不需要的
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined

  // 如果没有childVal就直接返回一个空对象或者是以parentVal为原型的空对象
  if (!childVal) return Object.create(parentVal || null)

  // 如果在非生产环境则进行类型的判断
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  // 如果没有parentVal就直接返回子选项
  if (!parentVal) return childVal

  // 如果parentVal和childVal都存在，那么ret就是合并后的结果
  const ret = {}

  // 把parentVal中的键值对混入到ret中
  extend(ret, parentVal)

  // 如果都存在，那么把这些属性都处理成数组格式的回调
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


// props、methods、inject和computed的合并策略，且这四个属性都是纯对象
// 前3个对象都会被normalize成纯对象，在书写的时候可以为数组或者其他格式，但是computed在书写的时候就只能为对象
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  //如果不是生产环境需要进行类型的检测
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  // 这里的原理同上，parentVal和childVal必定是会存在一个的，如果都不存在，那么是不会进行策略的合并的
  // 如果不存在parentVal，那么就返回childVal
  if (!parentVal) return childVal

  // 如果parentVal存在，那么创建一个空对象作为ret，作为最后的返回值使用
  const ret = Object.create(null)

  // 把parnetVal的键值对混入到ret中
  extend(ret, parentVal)

  // 如果childVal存在的话，把childVal的键值对混入到ret中，这里值得注意的是,extend混入的时候只是把键值对强制的混入不会做判断
  // 这里导致的结果就是childVal中的props、methods、inject、computed的属性会覆盖掉同名的parentVal的属性
  if (childVal) extend(ret, childVal)
  return ret
}

// provide的合并的策略就是mergeDataOrFn。这个和data的合并策略是相同的，都是返回调用mergeDataOrFn的结果
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


// 如果判断的value不是纯对象就会产生告警
// 这个的一个用途就是会在非生产环境下用于判断options中filters、components、和directives的类型。必须是纯对象
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

  //同样可以合并通过继承Vue的子类的参数。比如说options.extends可以传入一个继承的构造函数（vue api中extends的例子），这个时候就需要要到这行代码
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

  // 其实在这之前还没有进行属性的合并，只是进行了一些对象格式或者类型的检查操作和序列化而已，真正的合并是下面的操作

  // 下面如果某个key既不存在与parentVal和childVal，那么就不会进行策略的合并

  // 先把parentVal的属性合并到最终的options内
  for (key in parent) {
    mergeField(key)
  }

  // 再把childVal中存在但是parentVal中不存在的属性进行合并
  for (key in child) {
    // 这里使用hasOwn是否和filters、components、directives的原型链混入有关？有待验证
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
