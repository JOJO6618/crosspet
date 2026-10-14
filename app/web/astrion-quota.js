// Quota source selection is shared by macOS and Windows. No account credentials enter the view.
;(function (root) {
  const finite = n => typeof n === 'number' && Number.isFinite(n)
  const pad = n => String(n).padStart(2, '0')
  function fresh(snapshot, now) {
    return snapshot && snapshot.version === 1 && snapshot.source === 'astrion' &&
      typeof snapshot.instance === 'string' && snapshot.instance.length <= 80 &&
      finite(snapshot.ts) && snapshot.ts <= now + 10 && now - snapshot.ts <= 45
  }
  function label(mins) {
    return mins >= 10080 ? '本周' : mins >= 1440 ? '今日' : `${Math.max(1, Math.floor(mins / 60))}小时`
  }
  function when(sec, now) {
    const d = new Date(sec * 1000)
    return sec - now < 86400 ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`
  }
  function view(packet, now) {
    if (!packet || !['live', 'stale'].includes(packet.status) || !finite(packet.at) ||
        packet.at > now + 10 || now - packet.at > 900 || !packet.rateLimits) return null
    const windows = []
    for (const key of ['primary', 'secondary']) {
      const w = packet.rateLimits[key]
      if (!w || !finite(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 ||
          !finite(w.windowDurationMins) || w.windowDurationMins <= 0 || w.windowDurationMins > 366 * 1440 ||
          !finite(w.resetsAt) || w.resetsAt <= 0 || w.resetsAt > 253402300799) continue
      windows.push({ label: label(w.windowDurationMins), used: w.usedPercent, reset: w.resetsAt })
    }
    if (!windows.length) return null
    const expired = windows.some(w => w.reset <= now)
    const stale = packet.status === 'stale' || now - packet.at > 150 || expired
    let marked = false
    const parts = windows.map(w => {
      // Passing a reset deadline does not prove a new balance. Wait for a successful query.
      if (w.reset <= now) return `${w.label} 待更新`
      let text = `${w.label} 剩余 ${Math.max(0, 100 - Math.round(w.used))}%`
      if (!marked) { marked = true; text += ` · ${when(w.reset, now)} 重置` }
      return text
    })
    let text = 'Astrion · ' + parts.join(' ｜ ')
    if (stale) {
      const at = new Date(packet.at * 1000)
      text += ` · ${pad(at.getHours())}:${pad(at.getMinutes())} 的旧数据`
    }
    return { text, low: windows.some(w => w.reset > now && w.used >= 90), windows,
      source: stale ? 'stale' : 'live', origin: 'astrion', epoch: String(packet.epoch || '').slice(0, 80) }
  }
  function select(snapshot, enabled, now) {
    if (!enabled) return null
    const packet = fresh(snapshot, now) && snapshot.quota && snapshot.quota.gpt
    return packet && packet.connected === true ? view(packet, now) : null
  }
  const api = { fresh, view, select }
  root.CrossPetAstrionQuota = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
