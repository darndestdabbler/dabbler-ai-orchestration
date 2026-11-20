using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Text;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>Where the commands the extension runs are shown: before each runs, and what it printed after.</summary>
    public interface IRouterEcho
    {
        /// <summary>The line a person could type to run the same verb: `dabbler &lt;args&gt;`.</summary>
        void Running(string commandLine);

        void Wrote(string output);
    }

    /// <summary>A verb the router refused or failed, in the router's own words.</summary>
    public sealed class RouterFailure : Exception
    {
        public RouterFailure(string words, int exitCode, string output = "")
            : base(words)
        {
            ExitCode = exitCode;
            Output = output;
        }

        /// <summary>The router's exit code, or -1 where it never ran or was stopped.</summary>
        public int ExitCode { get; }

        /// <summary>What the verb printed on standard output before it failed: a `--json` verb prints its answer when it refuses too.</summary>
        public string Output { get; }
    }

    /// <summary>Runs one router verb with `node` on the bundle the extension carries, and returns what it printed.</summary>
    public sealed class Router
    {
        private static readonly TimeSpan DefaultTimeout = TimeSpan.FromMinutes(5);

        private readonly IRouterEcho? echo;

        public Router(string bundlePath, IRouterEcho? echo = null)
        {
            BundlePath = bundlePath;
            this.echo = echo;
        }

        public string BundlePath { get; }

        /// <summary>
        /// Runs `dabbler <paramref name="args"/>` in <paramref name="workingFolder"/>
        /// and returns its standard output; throws <see cref="RouterFailure"/>
        /// carrying what it printed when it exits other than 0, cannot start,
        /// or outlasts <paramref name="timeout"/> (five minutes when not given).
        /// </summary>
        public string Run(string workingFolder, IReadOnlyList<string> args, TimeSpan? timeout = null)
        {
            echo?.Running(CommandLine(args));
            using var process = new Process { StartInfo = StartInfo(BundlePath, workingFolder, args) };
            try
            {
                process.Start();
            }
            catch (Win32Exception error)
            {
                throw new RouterFailure($"node could not be started: {error.Message}", -1);
            }
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            var limit = timeout ?? DefaultTimeout;
            if (!process.WaitForExit((int)limit.TotalMilliseconds))
            {
                try { process.Kill(); } catch (InvalidOperationException) { }
                throw new RouterFailure($"`{CommandLine(args)}` did not finish within {limit.TotalSeconds:0} seconds and was stopped.", -1);
            }
            process.WaitForExit();
            var output = stdout.Result;
            var errors = stderr.Result;
            echo?.Wrote(output + errors);
            if (process.ExitCode != 0)
            {
                var words = errors.Trim().Length > 0 ? errors.Trim() : output.Trim();
                throw new RouterFailure(words.Length > 0 ? words : $"`{CommandLine(args)}` exited {process.ExitCode}.", process.ExitCode, output);
            }
            return output;
        }

        /// <summary>The verb as a person types it, each argument quoted where it needs to be.</summary>
        internal static string CommandLine(IEnumerable<string> args)
        {
            return string.Join(" ", new[] { "dabbler" }.Concat(args.Select(Quote)));
        }

        internal static ProcessStartInfo StartInfo(string bundlePath, string workingFolder, IEnumerable<string> args)
        {
            return new ProcessStartInfo("node", string.Join(" ", new[] { bundlePath }.Concat(args).Select(Quote)))
            {
                WorkingDirectory = workingFolder,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                CreateNoWindow = true,
            };
        }

        /// <summary>
        /// One argument as the Windows C runtime reads it back: quoted where it
        /// holds a space, a tab or a quote, with the backslashes before a quote
        /// doubled. netstandard2.0 has no argument list to do it.
        /// </summary>
        public static string Quote(string arg)
        {
            if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return arg;
            var quoted = new StringBuilder("\"");
            var backslashes = 0;
            foreach (var c in arg)
            {
                if (c == '\\')
                {
                    backslashes++;
                    continue;
                }
                quoted.Append('\\', c == '"' ? backslashes * 2 + 1 : backslashes);
                backslashes = 0;
                quoted.Append(c);
            }
            quoted.Append('\\', backslashes * 2);
            return quoted.Append('"').ToString();
        }
    }
}
