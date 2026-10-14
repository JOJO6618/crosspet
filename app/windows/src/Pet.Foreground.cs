using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

namespace CrossPet
{
    sealed partial class Pet
    {

        void FollowForeground()
        {
            var exe = Native.ForegroundExe();
            var map = Store.ReadJson(Store.AppMap);
            var match = exe == "" ? null : map?.FirstOrDefault(kv => string.Equals(kv.Key, exe, StringComparison.OrdinalIgnoreCase)).Value as string;
            frontIsAI = !string.IsNullOrWhiteSpace(match);
            ApplyLayer();
            if (!ready || Paused || !Store.Flag("followApps") || exe == "") return;
            if (string.IsNullOrWhiteSpace(match)) return;   // 对照表里没有，或者值留空：这个程序不跟随
            match = HostCharacter(match);
            if (match != current) SwitchTo(match);
        }

        /// <summary>
        /// 一个程序里能用好几家模型（比如 DeepSeek Harness）：它的接入插件把当前角色写在 &lt;角色&gt;-host.json，
        /// 切到这个程序时换成那个角色。一天内写的才算，角色不存在就还用对照表里的
        /// </summary>
        static readonly Dictionary<string, string> HostDefaults = new Dictionary<string, string> { ["zcode"] = "glm" };
        string HostCharacter(string id)
        {
            var file = Path.Combine(Store.State, id + "-host.json");
            try
            {
                // 还不知道它在用哪个模型（刚装好、还没对话过）：先按它默认的模型换，比如 ZCode 默认是 GLM
                if (!File.Exists(file) || (DateTime.UtcNow - File.GetLastWriteTimeUtc(file)).TotalHours > 24)
                    return HostDefaults.TryGetValue(id, out var d) && Characters().Any(x => x.id == d) ? d : id;
            }
            catch { return id; }
            var host = Store.ReadJson(file);
            if (id == "astrion")
            {
                // Astrion 的状态随时在变：时间戳取不到、或者已经过了 45 秒，就不跟着它换。
                // 前台切窗口是单独的回调，没有外层兜底，这里不能抛异常
                if (host == null || !host.TryGetValue("ts", out var raw) || !TryUnixSeconds(raw, out var ts) || Math.Abs(Now - ts) > 45) return id;
            }
            var c = host != null && host.TryGetValue("character", out var v) ? v as string : null;
            return c != null && Characters().Any(x => x.id == c) ? c : id;
        }

        /// <summary>把 JSON 里的时间戳读成秒：数字直接用，字符串尽量解析，取不到不抛异常。</summary>
        static bool TryUnixSeconds(object value, out double seconds)
        {
            seconds = 0;
            if (value == null) return false;
            if (value is double || value is float || value is long || value is int)
            {
                seconds = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
                return true;
            }
            var text = value as string;
            return text != null && double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out seconds);
        }
    }
}
