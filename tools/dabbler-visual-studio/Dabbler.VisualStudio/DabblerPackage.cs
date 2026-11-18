using System;
using System.ComponentModel.Design;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The extension's package. It autoloads nothing: Visual Studio loads it
    /// the first time one of its commands is used.
    /// </summary>
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    // Docked beside the Solution Explorer, as VS Code's sits in its explorer.
    [ProvideToolWindow(typeof(WorkExplorerWindow), Style = VsDockStyle.Tabbed, Window = "3ae79031-e1bc-11d0-8f78-00a0c9110057")]
    // Docked with the Output window, where a developer looks for what is running.
    [ProvideToolWindow(typeof(TerminalWindow), Style = VsDockStyle.Tabbed, Window = "34e76e81-ee4a-11d0-ae2e-00a0c90fffc3")]
    [Guid(PackageGuidString)]
    public sealed class DabblerPackage : AsyncPackage
    {
        public const string PackageGuidString = "425b072f-e523-4795-9b61-5716674585bd";

        private static readonly Guid CommandSet = new Guid("a9db3fec-b5ee-439b-acfe-21f711d1ec33");
        private const int VersionCommandId = 0x0100;
        private const int WorkExplorerCommandId = 0x0101;
        private const int TerminalCommandId = 0x0102;

        private bool nodePassed;
        private Router? router;

        /// <summary>The router the extension carries; null until the package has initialized.</summary>
        internal Router? Router => router;

        /// <summary>The Dabbler Commands pane; null until the package has initialized.</summary>
        internal CommandsPane? Commands { get; private set; }

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            var output = await GetServiceAsync(typeof(SVsOutputWindow)) as IVsOutputWindow
                ?? throw new InvalidOperationException("Visual Studio offered no Output window.");
            var bundle = Path.Combine(Path.GetDirectoryName(typeof(DabblerPackage).Assembly.Location)!, "router", "dabbler.cjs");
            Commands = CommandsPane.Create(output);
            router = new Router(bundle, Commands);
            var commands = await GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService
                ?? throw new InvalidOperationException("Visual Studio offered no menu command service.");
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(ShowVersionAsync).FileAndForget("dabbler/version"),
                new CommandID(CommandSet, VersionCommandId)));
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(ShowWorkExplorerAsync).FileAndForget("dabbler/work-explorer"),
                new CommandID(CommandSet, WorkExplorerCommandId)));
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(ShowTerminalAsync).FileAndForget("dabbler/terminal"),
                new CommandID(CommandSet, TerminalCommandId)));
        }

        /// <summary>View > Other Windows > Dabbler Work Explorer.</summary>
        private async Task ShowWorkExplorerAsync()
        {
            await ShowToolWindowAsync(typeof(WorkExplorerWindow), 0, create: true, DisposalToken);
        }

        /// <summary>View > Other Windows > Dabbler Terminal.</summary>
        private async Task ShowTerminalAsync()
        {
            await ShowToolWindowAsync(typeof(TerminalWindow), 0, create: true, DisposalToken);
        }

        /// <summary>
        /// The Dabbler Terminal shown, created if it was not, without taking
        /// the keyboard from wherever the developer has it.
        /// </summary>
        internal async Task ShowTerminalQuietlyAsync()
        {
            var window = await FindToolWindowAsync(typeof(TerminalWindow), 0, create: true, DisposalToken);
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            if (window?.Frame is IVsWindowFrame frame) frame.ShowNoActivate();
        }

        /// <summary>The open solution's folder, or null where no solution is open.</summary>
        internal async Task<string?> SolutionFolderAsync()
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync();
            if (!(await GetServiceAsync(typeof(SVsSolution)) is IVsSolution solution)) return null;
            if (ErrorHandler.Failed(solution.GetSolutionInfo(out var folder, out _, out _))) return null;
            return string.IsNullOrEmpty(folder) ? null : folder;
        }

        /// <summary>Dabbler: Version -- `dabbler version`, which proves the road from Visual Studio to the router.</summary>
        private async Task ShowVersionAsync()
        {
            if (router == null || !await EnsureNodeAsync()) return;
            await TaskScheduler.Default;
            string text;
            try
            {
                text = router.Run(Path.GetDirectoryName(router.BundlePath)!, new[] { "version" }).Trim();
            }
            catch (RouterFailure failure)
            {
                text = failure.Message;
            }
            await JoinableTaskFactory.SwitchToMainThreadAsync();
            Show(text, OLEMSGICON.OLEMSGICON_INFO);
        }

        /// <summary>
        /// Whether Node can run the router, asked on the first command and
        /// remembered once it passes. Until then every command says why and
        /// does nothing else.
        /// </summary>
        internal async Task<bool> EnsureNodeAsync()
        {
            if (nodePassed) return true;
            await TaskScheduler.Default;
            var refusal = NodeCheck.Ask();
            await JoinableTaskFactory.SwitchToMainThreadAsync();
            if (refusal == null)
            {
                nodePassed = true;
                return true;
            }
            Show(refusal, OLEMSGICON.OLEMSGICON_WARNING);
            return false;
        }

        private void Show(string text, OLEMSGICON icon)
        {
            VsShellUtilities.ShowMessageBox(this, text, "Dabbler", icon, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
