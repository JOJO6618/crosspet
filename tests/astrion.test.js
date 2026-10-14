const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const pet = require('../app/web/astrion.js')
const roles = ['gpt', 'claude', 'deepseek']
const entry = (overrides = {}) => ({ character: 'gpt', pose: 'reading', event: 'PreToolUse', ts: 100, event_ts: 99, revision: 1, active: true, ...overrides })
const snapshot = sessions => ({ version: 1, source: 'astrion', instance: 'backend-one', sequence: 1, ts: 100, sessions })

test('one source can have concurrent sessions and separate models', () => {
  const groups = pet.project(snapshot({ one: entry(), two: entry(), three: entry({ character: 'claude' }) }), roles, 'deepseek', 101)
  assert.equal(Object.keys(groups.gpt).length, 2)
  assert.equal(Object.keys(groups.claude).length, 1)
})

test('same session id in another backend cannot collide', () => {
  const first = pet.project(snapshot({ same: entry() }), roles, 'gpt', 101)
  const other = { ...snapshot({ same: entry() }), instance: 'backend-two' }
  const second = pet.project(other, roles, 'gpt', 101)
  assert.notEqual(Object.keys(first.gpt)[0], Object.keys(second.gpt)[0])
})

test('uninstalled/unknown model uses the current character', () => {
  const groups = pet.project(snapshot({ one: entry({ character: 'not-installed' }) }), roles, 'deepseek', 101)
  assert.equal(Object.keys(groups.deepseek).length, 1)
})

test('stale, future, malformed and unsupported snapshots are ignored', () => {
  for (const value of [null, { ...snapshot({ one: entry() }), version: 2 },
    { ...snapshot({ one: entry() }), source: 'another' }, { ...snapshot({ one: entry() }), ts: 0 },
    { ...snapshot({ one: entry() }), ts: 120 }, { ...snapshot({ one: entry() }), sessions: [] }]) {
    assert.deepEqual(pet.project(value, roles, 'gpt', 101), {})
  }
})

test('completed sessions disappear after their short celebration', () => {
  const value = snapshot({ done: entry({ pose: 'happy', event: 'Stop', active: false }) })
  assert.equal(Object.keys(pet.project(value, roles, 'gpt', 102).gpt).length, 1)
  assert.deepEqual(pet.project(value, roles, 'gpt', 105), {})
})

test('source merge preserves external hooks when Astrion clears its sessions', () => {
  const registry = pet.registry()
  registry.set('gpt', 'hooks', { same: entry({ pose: 'writing' }) })
  assert.equal(Object.keys(registry.set('gpt', 'astrion', { same: entry() })).length, 2)
  const left = registry.set('gpt', 'astrion', {})
  assert.deepEqual(Object.keys(left), ['same'])
  assert.equal(left['same'].pose, 'writing')
})

test('an active external tool is not overwritten by Astrion completion', () => {
  const state = pet.stateRegistry()
  state.accept('gpt', 'hooks', entry({ pose: 'writing' }), 101)
  const selected = state.accept('gpt', 'astrion', entry({ pose: 'happy', event: 'Stop', active: false, ts: 101 }), 101)
  assert.equal(selected.pose, 'writing')
  assert.equal(selected._heartbeat, true)
})

test('waiting takes priority and explicitly resolved wait resumes work', () => {
  const state = pet.stateRegistry()
  state.accept('gpt', 'hooks', entry(), 101)
  assert.equal(state.accept('gpt', 'astrion', entry({ pose: 'asking', event: 'PermissionRequest', _key: 'wait' }), 101).pose, 'asking')
  assert.equal(state.accept('gpt', 'astrion', entry({ pose: 'thinking', event_ts: 102, ts: 102, _key: 'resolved' }), 102).pose, 'thinking')
})

test('heartbeats update liveness without replaying a tool or completion', () => {
  const state = pet.stateRegistry()
  const initial = entry({ _key: 'session:1' })
  assert.equal(state.accept('gpt', 'astrion', initial, 100)._heartbeat, false)
  assert.equal(state.accept('gpt', 'astrion', { ...initial, ts: 110 }, 110)._heartbeat, true)
  assert.equal(state.accept('gpt', 'astrion', { ...initial, _key: 'session:2', pose: 'writing', ts: 111 }, 111)._heartbeat, false)
})

test('an active session has priority over another session finishing', () => {
  assert.equal(pet.newest([entry({ pose: 'happy', event: 'Stop', active: false, event_ts: 110 }), entry({ pose: 'writing' })]).pose, 'writing')
})

test('view clears old model membership and expires when backend disappears', () => {
  const calls = [], states = []
  let now = 101
  const context = { CrossPetAstrion: pet, manifest: { characters: { gpt: {}, claude: {} } }, charId: 'gpt',
    Date: { now: () => now * 1000 }, setInterval: () => {},
    setSessions: (id, map, source) => calls.push({ id, map, source }),
    applyCharState: (id, state, source) => states.push({ id, state, source }) }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(require.resolve('../app/web/astrion-view.js'), 'utf8'), context)
  context.applyAstrionSnapshot(snapshot({ same: entry() }))
  context.applyAstrionSnapshot(snapshot({ same: entry({ character: 'claude', revision: 2 }) }))
  assert.deepEqual(Object.keys(calls.findLast(x => x.id === 'gpt').map), [])
  assert.equal(Object.keys(calls.findLast(x => x.id === 'claude').map).length, 1)
  now = 200
  context.applyAstrionSnapshot(snapshot({ same: entry({ character: 'claude' }) }))
  assert.deepEqual(Object.keys(calls.findLast(x => x.id === 'claude').map), [])
  assert.equal(states.at(-1).state.pose, 'idle')
})
