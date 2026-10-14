import Cocoa
import WebKit

extension App {
    var recentAstrionPoses: [(pose: String, at: Date)] {
        Date().timeIntervalSince(astrionUpdatedAt) < 45 ? Array(astrionPoses.values) : []
    }

    /// Astrion owns one isolated snapshot; other integrations keep their files.
    func pollAstrion() {
        guard !pauseRealEvents else { return }
        let url = astrionStateDir.appendingPathComponent("astrion-state.json")
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? NSNumber, size.intValue <= 1_000_000,
              let stamp = attrs[.modificationDate] as? Date else {
            astrionPoses.removeAll()
            if stamps.removeValue(forKey: "astrion-state") != nil { js("applyAstrionSnapshot(null)") }
            return
        }
        guard stamps["astrion-state"] != stamp else { return }
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let version = object["version"] as? Int, version == 1,
              object["source"] as? String == "astrion",
              let ts = object["ts"] as? Double, abs(Date().timeIntervalSince1970 - ts) < 45,
              let entries = object["sessions"] as? [String: [String: Any]],
              entries.count <= 256, let text = String(data: data, encoding: .utf8) else {
            astrionPoses.removeAll()
            js("applyAstrionSnapshot(null)")
            return
        }
        astrionPoses.removeAll()
        astrionUpdatedAt = Date(timeIntervalSince1970: ts)
        stamps["astrion-state"] = stamp
        devJS("logEvent('astrion', 'snapshot', \(text), false)")
        var latest: (id: String, at: Double)?
        for (sid, value) in entries {
            let raw = value["character"] as? String ?? "current"
            guard (characterIds.contains(raw) ? raw : currentId) != nil else { continue }
            let pose = value["pose"] as? String ?? "idle"
            let active = value["active"] as? Bool ?? false
            let at = value["event_ts"] as? Double ?? ts
            if active || Date().timeIntervalSince1970 - at < 8 {
                astrionPoses[sid] = (pose, Date(timeIntervalSince1970: active ? ts : at))
            }
            if active, raw != "current", characterIds.contains(raw),
               (Date().timeIntervalSince1970 - at < 30), (at > (latest?.at ?? 0)) { latest = (raw, at) }
        }
        if followApps, let latest,
           latest.at > (stamps["astrion-event"]?.timeIntervalSince1970 ?? 0) {
            stamps["astrion-event"] = Date(timeIntervalSince1970: latest.at)
            if latest.id != currentId { switchTo(latest.id) }
        }
        js("applyAstrionSnapshot(\(text))")
    }
}
