using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Compare With Its Start: the files a complete session changed, between
    /// the commit before its first and its last, and Visual Studio's own
    /// comparison of the one chosen. A session's work is committed by the
    /// time anyone looks, so Git Changes has nothing to show.
    /// </summary>
    internal sealed class CompareWithStart
    {
        private static readonly TimeSpan GitLimit = TimeSpan.FromMinutes(1);

        private readonly DabblerPackage package;

        public CompareWithStart(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Lists what session <paramref name="session"/> of <paramref name="repositoryRoot"/> changed, and compares the file chosen.</summary>
        public async Task CompareAsync(string repositoryRoot, int session)
        {
            await TaskScheduler.Default;
            SessionRange? range;
            IReadOnlyList<ChangedFile> files;
            try
            {
                range = SessionChanges.Range(Text(await GitAsync(repositoryRoot, SessionChanges.LogArguments)), session);
                files = range == null ? Array.Empty<ChangedFile>() : SessionChanges.Files(Text(await GitAsync(repositoryRoot, SessionChanges.DiffArguments(range))));
            }
            catch (InvalidOperationException failure)
            {
                await SayAsync(failure.Message);
                return;
            }
            if (range == null)
            {
                await SayAsync($"Session {session} has no commit of its own on this branch's history, so there is nothing to compare.");
                return;
            }
            if (files.Count == 0)
            {
                await SayAsync($"Session {session} changed no file between {Short(range.Start)} and {Short(range.End)}.");
                return;
            }
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            var title = $"The files session {session} changed, from {Short(range.Start)} (before its first commit) to {Short(range.End)} (its last)";
            var chosen = PickDialog.Choose(title, files.Select(file => (file.Path, file.Description)).ToList());
            if (chosen == null) return;
            var file = files[chosen.Value];
            await TaskScheduler.Default;
            string left, right;
            try
            {
                var folder = Path.Combine(Path.GetTempPath(), "Dabbler", "compare", $"s{session}-{Guid.NewGuid():N}");
                left = await SideAsync(repositoryRoot, folder, Short(range.Start), range.Start, file.Change == FileChange.Added ? null : file.OldPath ?? file.Path);
                right = await SideAsync(repositoryRoot, folder, Short(range.End), range.End, file.Change == FileChange.Deleted ? null : file.Path);
            }
            catch (Exception error) when (error is InvalidOperationException || error is IOException || error is UnauthorizedAccessException)
            {
                await SayAsync(error.Message);
                return;
            }
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (!(await package.GetServiceAsync(typeof(SVsDifferenceService)) is IVsDifferenceService differences))
            {
                await SayAsync("Visual Studio's comparison is not available here.");
                return;
            }
            var options = (uint)(__VSDIFFSERVICEOPTIONS.VSDIFFOPT_LeftFileIsTemporary | __VSDIFFSERVICEOPTIONS.VSDIFFOPT_RightFileIsTemporary);
            differences.OpenComparisonWindow2(left, right,
                $"{Path.GetFileName(file.Path)}: session {session}",
                $"{file.Path}, {file.Description} by session {session}",
                $"{file.OldPath ?? file.Path} @ {Short(range.Start)}",
                $"{file.Path} @ {Short(range.End)}",
                null, null, options);
        }

        /// <summary>
        /// The file at <paramref name="path"/> as <paramref name="commit"/>
        /// holds it, written under <paramref name="folder"/>; an empty file
        /// where the side does not exist (<paramref name="path"/> null).
        /// </summary>
        private static async Task<string> SideAsync(string repositoryRoot, string folder, string label, string commit, string? path)
        {
            var directory = Path.Combine(folder, label);
            Directory.CreateDirectory(directory);
            var file = Path.Combine(directory, path == null ? "(none)" : Path.GetFileName(path));
            File.WriteAllBytes(file, path == null ? Array.Empty<byte>() : await GitAsync(repositoryRoot, new[] { "show", $"{commit}:{path}" }));
            return file;
        }

        /// <summary>What git printed, as bytes; an <see cref="InvalidOperationException"/> saying why where it failed.</summary>
        private static async Task<byte[]> GitAsync(string repositoryRoot, IReadOnlyList<string> args)
        {
            var info = new ProcessStartInfo("git", string.Join(" ", args.Select(Router.Quote)))
            {
                WorkingDirectory = repositoryRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            using var process = new Process { StartInfo = info };
            try
            {
                process.Start();
            }
            catch (Win32Exception error)
            {
                throw new InvalidOperationException($"git could not be started: {error.Message}");
            }
            using var output = new MemoryStream();
            var copy = process.StandardOutput.BaseStream.CopyToAsync(output);
            var errors = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit((int)GitLimit.TotalMilliseconds))
            {
                try { process.Kill(); } catch (InvalidOperationException) { }
                throw new InvalidOperationException($"git {string.Join(" ", args)} did not finish within {GitLimit.TotalSeconds:0} seconds and was stopped.");
            }
            process.WaitForExit();
            await copy;
            var said = await errors;
            if (process.ExitCode != 0)
            {
                var words = said.Trim();
                throw new InvalidOperationException($"git {string.Join(" ", args)} failed: {(words.Length > 0 ? words : $"it exited {process.ExitCode}")}");
            }
            return output.ToArray();
        }

        private static string Text(byte[] bytes) => Encoding.UTF8.GetString(bytes);

        private static string Short(string commit) => commit.Length > 8 ? commit.Substring(0, 8) : commit;

        private async Task SayAsync(string text)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            VsShellUtilities.ShowMessageBox(package, text, "Dabbler",
                OLEMSGICON.OLEMSGICON_INFO, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
