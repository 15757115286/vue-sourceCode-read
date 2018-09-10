/* @flow */

// 不能进行任何操作的空对象：这里感觉用Object.create(null)可能更好
export const emptyObject = Object.freeze({})

// 一些验证对象类型的函数
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}

export function isDef (v: any): boolean %checks {
  return v !== undefined && v !== null
}

export function isTrue (v: any): boolean %checks {
  return v === true
}

export function isFalse (v: any): boolean %checks {
  return v === false
}

// 检查对象是否是简单类型，string,number,boolean，这里把es6加入的symbol也认定为简单类型
export function isPrimitive (value: any): boolean %checks {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}

// 简单的验证一个数据是否为对象（广义的，比如Array也算是一个对象）
export function isObject (obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object'
}

/**
 * Get the raw type string of a value e.g. [object Object]
 */
const _toString = Object.prototype.toString

// 获取未加工的数据类型，可以区分更多js源生的数据类型，如Array等
export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)
}

// 这个是严格的类型检查，只有对象才会返回true,哪怕是Array都不可以
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}

export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}

// 验证一个数字是否可以转化为合法的数组下标
export function isValidArrayIndex (val: any): boolean {
  const n = parseFloat(String(val))
  return n >= 0 && Math.floor(n) === n && isFinite(val)
}

/**
 * Convert a value to a string that is actually rendered.
 */
// 把值转化为实际渲染的字符串。如果是对象格式，则用JSON进行序列化，否则就用String来转化
export function toString (val: any): string {
  return val == null
    ? ''
    : typeof val === 'object'
      ? JSON.stringify(val, null, 2)
      : String(val)
}

// 转化一个字符串为数字，如果转化失败则返回原来的字符串
export function toNumber (val: string): number | string {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}

// 这个函数主要的功能是返回一个Map函数，用来映射一一对应用逗号分隔的属性
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

// 这个是返回一个Map，用来验证保留的Vue的内置的标签
export const isBuiltInTag = makeMap('slot,component', true)

// 同上，用来验证Vue内置特性的Map
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')

// 用来移除数组中的某一项，因为是用的indexOf函数来判断是否相等的，所以1 !== '1'这样类似的需要注意
export function remove (arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    const index = arr.indexOf(item)
    if (index > -1) {
      return arr.splice(index, 1)
    }
  }
}

// 验证一个对象/数组自身是否包含否个属性
const hasOwnProperty = Object.prototype.hasOwnProperty
export function hasOwn (obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}

// 用来缓存一个纯函数（又称为幂等函数：如果输入的参数相同，输入的结果必然相同的函数）的结果
export function cached<F: Function> (fn: F): F {
  const cache = Object.create(null)
  return (function cachedFn (str: string) {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }: any)
}

// 将连字符的字符串转化为驼峰式的字符串
const camelizeRE = /-(\w)/g
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})

// 将一个字符串首字母大写
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})

// 将驼峰式的字符串改成用连字符的字符串
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})

// 一个简单的bind的腻子补丁用来向后兼容例如PhantomJS 1.x.这样的内容
function polyfillBind (fn: Function, ctx: Object): Function {
  function boundFn (a) {
    const l = arguments.length
    return l
      ? l > 1
        ? fn.apply(ctx, arguments)
        : fn.call(ctx, a)
      : fn.call(ctx)
  }

  boundFn._length = fn.length
  return boundFn
}

// 宿主环境自带的bind函数
function nativeBind (fn: Function, ctx: Object): Function {
  return fn.bind(ctx)
}

export const bind = Function.prototype.bind
  ? nativeBind
  : polyfillBind

// 转化一个类数组为一个真实的数组，类似于es6的Array.from()
export function toArray (list: any, start?: number): Array<any> {
  start = start || 0
  let i = list.length - start
  const ret: Array<any> = new Array(i)
  while (i--) {
    ret[i] = list[i + start]
  }
  return ret
}

// 把指定对象的属性混合到目标对象，这里由于用的是in操作符，请小心原型上的属性
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}

// 讲一个数组中所有的对象的属性浅拷贝到一个对象里面，后面的对象属性会覆盖前面对象的属性
export function toObject (arr: Array<any>): Object {
  const res = {}
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i])
    }
  }
  return res
}

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/)
 */
export function noop (a?: any, b?: any, c?: any) {}

/**
 * Always return false.
 */
export const no = (a?: any, b?: any, c?: any) => false

/**
 * Return same value
 */
export const identity = (_: any) => _

// 将modules中所有的staticKeys转为一个静态的用逗号分隔的字符串
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  return modules.reduce((keys, m) => {
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}

// 验证两个数据是否相等个，如果是数组或者对象并且引用不同，则递归的验证每个属性的值是否相等
export function looseEqual (a: any, b: any): boolean {
  // 这里主要是为了验证两个对象的引用是否为相同
  if (a === b) return true
  const isObjectA = isObject(a)
  const isObjectB = isObject(b)
  if (isObjectA && isObjectB) {
    try {
      const isArrayA = Array.isArray(a)
      const isArrayB = Array.isArray(b)
      if (isArrayA && isArrayB) {
        return a.length === b.length && a.every((e, i) => {
          return looseEqual(e, b[i])
        })
      } else if (!isArrayA && !isArrayB) {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        return keysA.length === keysB.length && keysA.every(key => {
          return looseEqual(a[key], b[key])
        })
      } else {
        /* istanbul ignore next */
        return false
      }
    } catch (e) {
      /* istanbul ignore next */
      return false
    }
  } else if (!isObjectA && !isObjectB) {
    return String(a) === String(b)
  } else {
    return false
  }
}

// 和数组源生的indexOf类型，只不过判定放宽了许多
export function looseIndexOf (arr: Array<mixed>, val: mixed): number {
  for (let i = 0; i < arr.length; i++) {
    if (looseEqual(arr[i], val)) return i
  }
  return -1
}

// 用闭包创建一个只可以使用一次的函数
export function once (fn: Function): Function {
  let called = false
  return function () {
    if (!called) {
      called = true
      fn.apply(this, arguments)
    }
  }
}
