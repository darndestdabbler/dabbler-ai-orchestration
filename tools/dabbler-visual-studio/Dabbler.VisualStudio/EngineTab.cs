using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Opens an engine's own CLI as a tab in the Dabbler window of Windows
    /// Terminal: for a session that just registered, a consult, or a
    /// Mechanic. What to start is `dabbler session launch`'s to say.
    /// </summary>
    internal sealed class EngineTab
    {
        // Win32's ERROR_FILE_NOT_FOUND: wt.exe is not installed.
        private const int FileNotFound = 2;

        private readonly DabblerPackage package;

        public EngineTab(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Reads this repository's configured choice and opens the engine <paramref name="action"/> names.</summary>
        public async Task OpenAsync(string repositoryRoot, WorkExplorerAction action)
        {
            if (!await package.EnsureNodeAsync()) return;
            var router = package.Router;
            if (router == null) return;
            await TaskScheduler.Default;
            var choice = SessionStarter.ReadConfiguration(router, repositoryRoot, out var unreadable);
            if (choice == null || choice.Missing != null)
            {
                await SayAsync(unreadable ?? choice!.Missing!, OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            await OpenAsync(repositoryRoot, action, choice);
        }

        /// <summary>Opens the engine <paramref name="action"/> names with <paramref name="choice"/>'s engine and model.</summary>
        public async Task OpenAsync(string repositoryRoot, WorkExplorerAction action, ConfiguredChoice choice)
        {
            var router = package.Router;
            if (router == null || choice.Engine == null) return;
            await TaskScheduler.Default;
            var model = action.Id == ActionIds.OpenMechanic ? choice.MechanicModel ?? choice.AuthoringModel : choice.AuthoringModel;
            EngineLaunch launch;
            try
            {
                launch = EngineLaunch.Parse(router.Run(repositoryRoot, EngineLaunch.Arguments(action, choice.Engine, model)));
            }
            catch (RouterFailure failure)
            {
                await SayAsync(failure.Message, OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            catch (FormatException error)
            {
                await SayAsync(error.Message, OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var program = WindowsTerminal.ProgramPath(launch.Program, path, Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD");
            var dabblerFolder = Path.GetDirectoryName(router.BundlePath)!;
            var started = Start(WindowsTerminal.TabStartInfo(launch, program, dabblerFolder, path), out var notStarted);
            if (!started && notStarted?.NativeErrorCode == FileNotFound)
            {
                // No Windows Terminal: the engine gets a console window of its own.
                started = Start(WindowsTerminal.ConsoleStartInfo(launch, program, dabblerFolder, path), out notStarted);
            }
            if (!started)
            {
                await SayAsync($"{launch.Title} could not be opened: {notStarted?.Message}", OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            if (launch.Typed == null) return;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            Clipboard.SetText(launch.Typed);
            await SayAsync($"{launch.Title} has no way to be given its first sentence, so it is on the clipboard. Paste it at the engine's prompt and press Enter:\n\n{launch.Typed}", OLEMSGICON.OLEMSGICON_INFO);
        }

        /// <summary>
        /// Opens the router's own command, `dabbler` with <paramref name="args"/>,
        /// as a tab titled <paramref name="title"/> in the Dabbler window of
        /// Windows Terminal, or a console of its own where there is none.
        /// Says why where it could not be opened; true where it was.
        /// </summary>
        public async Task<bool> OpenRouterAsync(string folder, string title, IReadOnlyList<string> args)
        {
            var router = package.Router;
            if (router == null) return false;
            await TaskScheduler.Default;
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var dabblerFolder = Path.GetDirectoryName(router.BundlePath)!;
            var started = Start(WindowsTerminal.RouterTabStartInfo(folder, title, args, dabblerFolder, path), out var notStarted);
            if (!started && notStarted?.NativeErrorCode == FileNotFound)
            {
                started = Start(WindowsTerminal.RouterConsoleStartInfo(folder, args, dabblerFolder, path), out notStarted);
            }
            if (!started) await SayAsync($"{title} could not be opened: {notStarted?.Message}", OLEMSGICON.OLEMSGICON_WARNING);
            return started;
        }

        private static bool Start(ProcessStartInfo info, out Win32Exception? error)
        {
            error = null;
            try
            {
                Process.Start(info)?.Dispose();
                return true;
            }
            catch (Win32Exception failure)
            {
                error = failure;
                return false;
            }
        }

        private async Task SayAsync(string text, OLEMSGICON icon)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            VsShellUtilities.ShowMessageBox(package, text, "Dabbler", icon, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
