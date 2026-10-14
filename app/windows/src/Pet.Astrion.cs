using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CrossPet
{
    sealed partial class Pet
    {
        readonly Dictionary<string, (string pose, DateTime at)> astrionPoses = new Dictionary<string, (string, DateTime)>();
        DateTime astrionUpdatedAt = DateTime.MinValue;
        IEnumerable<(string pose, DateTime at)> RecentAstrionPoses =>
            (DateTime.UtcNow - astrionUpdatedAt).TotalSeconds < 45 ? astrionPoses.Values.AsEnumerable() : Enumerable.Empty<(string pose, DateTime at)>();

        void PollAstrion()
        {
            if (Paused) return;
            var file = Path.Combine(Store.State, "astrion-state.json");
            try
            {
                var fi = new FileInfo(file);
                if (!fi.Exists || fi.Length > 1_000_000)
                {
                    astrionPoses.Clear();
                    if (stamps.Remove("astrion-state")) Js("applyAstrionSnapshot(null)");
                    return;
                }
                var stamp = fi.LastWriteTimeUtc.Ticks + ":" + fi.Length;
                if (stamps.TryGetValue("astrion-state", out var old) && old == stamp) return;
                var value = Store.ReadJson(file);
                if (value == null || !value.TryGetValue("version", out var version) || Convert.ToInt32(version) != 1 ||
                    !value.TryGetValue("source", out var source) || source as string != "astrion" ||
                    !value.TryGetValue("ts", out var timestamp) || Math.Abs(Now - Convert.ToDouble(timestamp)) > 45 ||
                    !value.TryGetValue("sessions", out var raw) || !(raw is Dictionary<string, object> entries) || entries.Count > 256)
                { astrionPoses.Clear(); Js("applyAstrionSnapshot(null)"); return; }
                astrionPoses.Clear();
                astrionUpdatedAt = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(Convert.ToDouble(timestamp));
                stamps["astrion-state"] = stamp;
                var json = Store.Json.Serialize(value);
                dev?.Js($"logEvent('astrion', 'snapshot', {json}, false)");
                var latest = (id: (string)null, ts: 0.0);
                foreach (var entry in entries)
                {
                    if (!(entry.Value is Dictionary<string, object> item)) continue;
                    var role = item.TryGetValue("character", out var c) ? c as string : null;
                    var pose = item.TryGetValue("pose", out var p) ? p as string : "idle";
                    var active = item.TryGetValue("active", out var a) && a is bool on && on;
                    var ts = item.TryGetValue("event_ts", out var t) ? Convert.ToDouble(t) : Convert.ToDouble(timestamp);
                    if (active || Now - ts < 8) astrionPoses[entry.Key] = (pose ?? "idle", active ? astrionUpdatedAt : new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(ts));
                    if (active && role != "current" && Characters().Any(x => x.id == role) && Now - ts < 30 && ts > latest.ts) latest = (role, ts);
                }
                var previous = stamps.TryGetValue("astrion-event", out var e) && double.TryParse(e, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var seen) ? seen : 0;
                if (Store.Flag("followEvents") && latest.id != null && latest.ts > previous)
                {
                    stamps["astrion-event"] = latest.ts.ToString(System.Globalization.CultureInfo.InvariantCulture);
                    if (latest.id != current) SwitchTo(latest.id);
                }
                Js($"applyAstrionSnapshot({json})");
            }
            catch (Exception e) { astrionPoses.Clear(); Js("applyAstrionSnapshot(null)"); Store.Log("Astrion 快照读取失败: " + e.GetType().Name); }
        }
    }
}
