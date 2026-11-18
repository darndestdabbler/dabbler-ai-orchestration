using System;
using System.ComponentModel.Design;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
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
    [Guid(PackageGuidString)]
    public sealed class DabblerPackage : AsyncPackage
    {
        public const string PackageGuidString = "425b072f-e523-4795-9b61-5716674585bd";

        private static readonly Guid CommandSet = new Guid("a9db3fec-b5ee-439b-acfe-21f711d1ec33");
        private const int VersionCommandId = 0x0100;

        private bool nodePassed;
        private Router? router;

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            var output = await GetServiceAsync(typeof(SVsOutputWindow)) as IVsOutputWindow
                ?? throw new InvalidOperationException("Visual Studio offered no Output window.");
            var bundle = Path.Combine(Path.GetDirectoryName(typeof(DabblerPackage).Assembly.Location)!, "router", "dabbler.cjs");
            router = new Router(bundle, CommandsPane.Create(output));
            var commands = await GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService
                ?? throw new InvalidOperationException("Visual Studio offered no menu command service.");
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(ShowVersionAsync).FileAndForget("dabbler/version"),
                new CommandID(CommandSet, VersionCommandId)));
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
