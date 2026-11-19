import CjslashFloatingVue from '../src/client'

describe('client entry', () => {
  it('exports the upstream FloatingVue plugin', () => {
    expect(typeof CjslashFloatingVue).toBe('object')
    expect(CjslashFloatingVue.install).toBeTypeOf('function')
  })
})
