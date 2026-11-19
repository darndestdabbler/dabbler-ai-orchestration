using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// A `--follow` verb kept running: the router prints one whole JSON
    /// document to a line whenever what it follows changes, and each line is
    /// handed on as it arrives. Disposing stops the router.
    /// </summary>
    public sealed class RouterFollow : IDisposable
    {
        private static readonly TimeSpan StopTimeout = TimeSpan.FromSeconds(5);

        private readonly Process process;

        /// <summary>
        /// Starts `dabbler <paramref name="args"/>` in <paramref name="workingFolder"/>;
        /// <paramref name="onDocument"/> is called on a background thread with
        /// each non-empty line, in order.
        /// </summary>
        public RouterFollow(Router router, string workingFolder, IReadOnlyList<string> args, Action<string> onDocument, IRouterEcho? echo = null)
        {
            echo?.Running(Router.CommandLine(args));
            process = new Process { StartInfo = Router.StartInfo(router.BundlePath, workingFolder, args), EnableRaisingEvents = true };
            process.OutputDataReceived += (_, line) =>
            {
                if (!string.IsNullOrWhiteSpace(line.Data)) onDocument(line.Data!);
            };
            process.ErrorDataReceived += (_, line) =>
            {
                if (!string.IsNullOrWhiteSpace(line.Data)) echo?.Wrote(line.Data!);
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }

        public void Dispose()
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit((int)StopTimeout.TotalMilliseconds);
                }
            }
            catch (InvalidOperationException)
            {
                // It ended between the question and the kill.
            }
            process.Dispose();
        }
    }
}
