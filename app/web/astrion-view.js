// Loaded after the existing pet view; no change to character assets or effects.
const petSourceSessions = CrossPetAstrion.registry()
const petSourceStates = CrossPetAstrion.stateRegistry()
let astrionSnapshot = null
let astrionGroups = new Set()
let gptQuotaEnabled = false
let astrionGPTQuotaEnabled = false
let codexQuotaSnapshot = null
let gptQuotaSignature = ''

function setGPTQuotaOptions(codexOn, astrionOn) {
  gptQuotaEnabled = !!codexOn
  astrionGPTQuotaEnabled = !!astrionOn && !gptQuotaEnabled
  renderGPTQuota()
}
function renderGPTQuota() {
  const now = Date.now() / 1000
  let q = null
  if (astrionGPTQuotaEnabled) {
    q = CrossPetAstrionQuota.select(astrionSnapshot, true, now)
  } else if (gptQuotaEnabled && codexQuotaSnapshot) {
    const codex = CodexQuota.view(codexQuotaSnapshot, now)
    if (codex) q = { ...codex, origin: 'codex', epoch: 'codex' }
  }
  const signature = JSON.stringify(q)
  if (signature === gptQuotaSignature) return
  gptQuotaSignature = signature
  setQuota('gpt', q)
}

function applyAstrionSnapshot(snapshot) {
  astrionSnapshot = snapshot
  const now = Date.now() / 1000
  const groups = CrossPetAstrion.project(snapshot, Object.keys(manifest.characters), charId, now)
  const ids = new Set([...astrionGroups, ...Object.keys(groups)])
  for (const id of ids) {
    const map = groups[id] || {}
    setSessions(id, map, 'astrion')
    const chosen = CrossPetAstrion.newest(Object.values(map))
    if (chosen) {
      const sid = Object.keys(map).find(key => map[key] === chosen)
      applyCharState(id, { ...chosen, _key: `${sid}:${chosen.revision}` }, 'astrion')
    } else {
      applyCharState(id, { pose: 'idle', event: 'SessionEnd', ts: now,
        event_ts: now, _key: 'astrion-idle', active: false }, 'astrion')
    }
  }
  astrionGroups = new Set(Object.keys(groups))
  if (astrionGPTQuotaEnabled) renderGPTQuota()
}

// Expiry works even when Astrion dies, the file disappears, or its output stops.
setInterval(() => {
  if (astrionSnapshot) applyAstrionSnapshot(astrionSnapshot)
}, 2000)
