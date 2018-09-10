/* @flow */

//检查一个字符是否是_或者$开头。0x24 === $  0x5F === _
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

//给对象定义一个可写、可更改配置的属性
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

//该正则可以匹配不是数字字符下划线以及.的字符
const bailRE = /[^\w.$]/
export function parsePath (path: string): any {
  //如果字符串中出现非法字符则返回
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  //返回一个闭包，闭包返回传入对象的对应路径的值
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
