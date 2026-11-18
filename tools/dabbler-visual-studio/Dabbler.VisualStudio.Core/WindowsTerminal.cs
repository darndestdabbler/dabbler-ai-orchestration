using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// Opens an engine as a tab in the Dabbler window of Windows Terminal, in
    /// the form docs/uat/uat-visual-studio.md section 5 found to work: the
    /// environment is set on the process that runs wt.exe, which the tab gets
    /// whole, and no `%NAME%` is written in the command line, because Windows
    /// Terminal expands one against the window's own, older environment.
    /// </summary>
    public static class WindowsTerminal
    {
        /// <summary>The window every Dabbler tab opens in; `-w` finds it, or opens it where it is not open.</summary>
        public const string WindowName = "Dabbler";

        /// <summary>
        /// `wt.exe -w Dabbler new-tab -d &lt;folder&gt; --title &lt;title&gt; &lt;program&gt; &lt;arguments&gt;`,
        /// with the launch's environment and <paramref name="dabblerFolder"/>
        /// first on PATH, so `dabbler` in the tab runs the bundle the extension carries.
        /// </summary>
        public static ProcessStartInfo TabStartInfo(EngineLaunch launch, string programPath, string dabblerFolder, string currentPath)
        {
            var args = new[] { "-w", WindowName, "new-tab", "-d", launch.Cwd, "--title", launch.Title, programPath }.Concat(launch.Args);
            // A bare `;` separates wt's own subcommands.
            var info = new ProcessStartInfo("wt.exe", string.Join(" ", args.Select(arg => Router.Quote(arg).Replace(";", "\\;"))));
            return WithEnvironment(info, launch, dabblerFolder, currentPath);
        }

        /// <summary>The same program, folder and environment, started directly: for a machine where wt.exe cannot be started.</summary>
        public static ProcessStartInfo ConsoleStartInfo(EngineLaunch launch, string programPath, string dabblerFolder, string currentPath)
        {
            var info = new ProcessStartInfo(programPath, string.Join(" ", launch.Args.Select(Router.Quote)));
            return WithEnvironment(info, launch, dabblerFolder, currentPath);
        }

        /// <summary>
        /// The full path of <paramref name="program"/>: the first folder on
        /// <paramref name="path"/> holding it with one of <paramref name="pathExt"/>'s
        /// extensions, or as named where it names its own; the program as
        /// named where no folder holds it.
        /// </summary>
        public static string ProgramPath(string program, string path, string pathExt)
        {
            if (Path.IsPathRooted(program)) return program;
            // An npm folder holds `claude` beside `claude.cmd`, and the one
            // without an extension is a shell script Windows cannot start.
            var names = Path.HasExtension(program)
                ? new[] { program }
                : pathExt.Split(';').Where(ext => ext.Length > 0).Select(ext => program + ext.ToLowerInvariant()).ToArray();
            foreach (var folder in path.Split(';').Where(folder => folder.Trim().Length > 0))
            {
                foreach (var name in names)
                {
                    var candidate = Path.Combine(folder.Trim(), name);
                    if (File.Exists(candidate)) return candidate;
                }
            }
            return program;
        }

        private static ProcessStartInfo WithEnvironment(ProcessStartInfo info, EngineLaunch launch, string dabblerFolder, string currentPath)
        {
            info.UseShellExecute = false;
            info.WorkingDirectory = launch.Cwd;
            foreach (var pair in launch.Env) info.Environment[pair.Key] = pair.Value;
            info.Environment["PATH"] = dabblerFolder + ";" + currentPath;
            return info;
        }
    }
}
