// Astrion snapshot protocol v1. Pure projection is also used by the Node tests.
;(function (root) {
  const POSES = new Set(['idle', 'sleeping', 'thinking', 'reading', 'writing', 'running', 'searching', 'drawing', 'delegating', 'asking', 'compact', 'happy', 'proud', 'surprised', 'oops'])
  const DONE = new Set(['idle', 'sleeping', 'happy', 'proud', 'surprised'])
  const FRESH = 45
  function active(s) { return s && (s.active === true || (!DONE.has(s.pose) && s.event !== 'Stop')) }
  function rank(s) { return active(s) ? (s.pose === 'asking' ? 2 : 1) : 0 }
  function newest(entries) { return entries.sort((a, b) => rank(b) - rank(a) || Number(b.event_ts || b.ts) - Number(a.event_ts || a.ts))[0] }
  function project(snapshot, ids, current, now) {
    const groups = {}
    if (!snapshot || snapshot.version !== 1 || snapshot.source !== 'astrion' ||
        typeof snapshot.instance !== 'string' || snapshot.instance.length > 80 ||
        !Number.isFinite(snapshot.ts) || now - snapshot.ts > FRESH || snapshot.ts > now + 10 ||
        !snapshot.sessions || typeof snapshot.sessions !== 'object' || Array.isArray(snapshot.sessions)) return groups
    for (const [sid, raw] of Object.entries(snapshot.sessions).slice(0, 256)) {
      if (!raw || !POSES.has(raw.pose) || !Number.isFinite(raw.ts) || !Number.isFinite(raw.revision)) continue
      const id = ids.includes(raw.character) ? raw.character : current
      const entry = { pose: raw.pose, event: String(raw.event || '').slice(0, 80), ts: raw.ts,
        event_ts: Number(raw.event_ts || raw.ts), revision: raw.revision, active: raw.active === true,
        tool: String(raw.tool || '').slice(0, 160) }
      if (!entry.active && now - entry.ts > 4) continue
      if (entry.active && now - entry.ts > FRESH) continue
      if (POSES.has(raw.after)) { entry.after = raw.after; entry.afterTs = Number(raw.afterTs) }
      ;(groups[id] ||= {})[`astrion:${snapshot.instance}:${sid}`] = entry
    }
    return groups
  }
  function registry() {
    const maps = new Map()
    return { set(id, source, map) {
      const sources = maps.get(id) || new Map()
      sources.set(source, map || {})
      maps.set(id, sources)
      return Object.fromEntries([...sources].flatMap(([name, entries]) =>
        Object.entries(entries).map(([sid, entry]) => [name === 'hooks' ? sid : `${name}:${sid}`, entry])))
    } }
  }
  function stateRegistry() {
    const maps = new Map(), emitted = new Map()
    const keyOf = (source, s) => JSON.stringify([source, s._key || s.event_ts || s.ts, s.pose, s.event, s.tool, s.afterTs])
    return { accept(id, source, value, now) {
      const sources = maps.get(id) || new Map()
      if (source === 'astrion' && value?.event === 'SessionEnd') sources.delete(source)
      else sources.set(source, value)
      maps.set(id, sources)
      const astrion = sources.get('astrion')
      // No participating Astrion source: preserve the existing hook path without
      // imposing new timestamp requirements, expiry or heartbeat suppression.
      if (source === 'hooks' && (!astrion || now - astrion.ts >= FRESH)) {
        emitted.set(id, keyOf('hooks', value))
        return value
      }
      const entries = [...sources].filter(([name, s]) => s && now - s.ts < (name === 'astrion' ? FRESH : s.pose === 'asking' ? 600 : 180))
      const selected = newest(entries.map(([, s]) => s)) || (source === 'astrion' ? value : null)
      if (!selected) return null
      const selectedSource = entries.find(([, s]) => s === selected)?.[0] || source
      const key = keyOf(selectedSource, selected)
      const repeat = emitted.get(id) === key
      emitted.set(id, key)
      return { ...selected, _heartbeat: repeat }
    } }
  }
  const api = { project, registry, stateRegistry, newest, active }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.CrossPetAstrion = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
