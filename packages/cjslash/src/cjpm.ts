import type { CjpmToml, CjpmTomlSection } from './types'
import { stringifyTOML } from 'confbox/toml'
import { CjslashError } from './error'

/**
 * Check whether a value can represent a TOML table.
 *
 * ---
 *
 * 检查一个值是否可以表示 TOML 表。
 */
export function isTomlSection(value: unknown): value is CjpmTomlSection {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * Merge manifest tables without modifying inputs; later values and arrays take precedence.
 *
 * ---
 *
 * 合并清单中的表且不修改输入，后传入的值及数组优先。
 */
export function mergeCjpmToml(...overrides: (CjpmToml | undefined)[]): CjpmToml {
  try {
    return overrides.reduce<CjpmToml>((merged, override): CjpmToml => {
      if (override === undefined) return merged
      if (!isTomlSection(override)) throw new TypeError('The cjpmToml option must be a serializable object.')
      if (override.package !== undefined && !isTomlSection(override.package)) throw new TypeError('The cjpmToml option must define package as a TOML table.')
      return mergeTomlSection(merged, override)
    }, {})
  }
  catch (cause) {
    throw new CjslashError('INVALID_CJPM_TOML', 'Cannot merge the cjpmToml configuration.', { cause })
  }
}

/**
 * Recursively merge two TOML tables and clone replacement values.
 *
 * ---
 *
 * 递归合并两个 TOML 表，并复制替换值。
 */
function mergeTomlSection(base: CjpmTomlSection, override: CjpmTomlSection): CjpmTomlSection {
  const merged = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    Object.defineProperty(merged, key, {
      value: isTomlSection(value)
        ? mergeTomlSection(isTomlSection(base[key])
            ? base[key]
            : {}, value)
        : structuredClone(value),
      writable: true,
      configurable: true,
      enumerable: true,
    })
  }
  return merged
}

/**
 * Merge JavaScript overrides into the temporary project manifest and serialize it with `confbox`.
 *
 * The module name always follows the source package declaration.
 *
 * ---
 *
 * 将 JavaScript 覆盖配置合并到临时项目清单，并通过 `confbox` 序列化。
 *
 * 模块名始终跟随源码中的包声明。
 */
export function resolveCjpmToml(version: string, overrides: CjpmToml = {}, moduleName = 'default'): string {
  const defaults: CjpmToml = {
    package: {
      'cjc-version': version,
      'name': moduleName,
      'version': '0.1.0',
      'output-type': 'static',
      'src-dir': 'src',
    },
  }
  try {
    return stringifyTOML(mergeCjpmToml(defaults, overrides, {
      package: { name: moduleName },
    }))
  }
  catch (cause) {
    throw new CjslashError('INVALID_CJPM_TOML', 'Cannot serialize the cjpmToml option as TOML.', { cause })
  }
}
