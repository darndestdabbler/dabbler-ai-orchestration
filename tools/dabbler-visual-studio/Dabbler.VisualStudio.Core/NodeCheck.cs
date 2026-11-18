using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// Whether the Node on PATH can run the router. The extension carries no
    /// Node: the developer installs it, and this says which version.
    /// </summary>
    public static class NodeCheck
    {
        /// <summary>The router's floor: `engines.node` in packages/router/package.json.</summary>
        public static readonly Version Floor = new Version(22, 18);

        private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(10);

        /// <summary>
        /// Null where <paramref name="versionLine"/> (what `node --version`
        /// printed, such as `v22.18.0`) meets the floor; otherwise the one
        /// sentence a developer is shown. A missing or unreadable line is Node
        /// not found.
        /// </summary>
        public static string? Judge(string? versionLine)
        {
            var match = Regex.Match(versionLine ?? "", @"^\s*v?(\d+)\.(\d+)\.(\d+)");
            Version? found = match.Success
                ? new Version(int.Parse(match.Groups[1].Value), int.Parse(match.Groups[2].Value), int.Parse(match.Groups[3].Value))
                : null;
            if (found != null && found >= Floor) return null;
            var has = found == null ? "Node.js was not found on PATH" : $"this machine has Node.js {found}";
            return $"Dabbler needs Node.js {Floor} or later and {has}: install Node.js {Floor} or later from https://nodejs.org, then restart Visual Studio, which reads PATH only when it starts.";
        }

        /// <summary>Runs `node --version` and judges what it printed; a Node that cannot be started is missing.</summary>
        public static string? Ask()
        {
            return Judge(VersionLine());
        }

        private static string? VersionLine()
        {
            var start = new ProcessStartInfo("node", "--version")
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            };
            try
            {
                using var process = Process.Start(start);
                if (process == null) return null;
                var output = process.StandardOutput.ReadToEndAsync();
                if (!process.WaitForExit((int)AskTimeout.TotalMilliseconds))
                {
                    process.Kill();
                    return null;
                }
                return output.Result;
            }
            catch (Win32Exception)
            {
                return null;
            }
        }
    }
}
