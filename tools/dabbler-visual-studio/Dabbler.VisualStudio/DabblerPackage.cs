using System;
using System.Collections.Generic;
using System.ComponentModel.Design;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Imaging;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Events;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using SolutionEvents = Microsoft.VisualStudio.Shell.Events.SolutionEvents;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The extension's package. It loads in the background once a solution
    /// is open, so a session that needs a person is said in the main window
    /// although no Dabbler window has been opened since Visual Studio started.
    /// </summary>
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [ProvideAutoLoad(VSConstants.UICONTEXT.SolutionExists_string, PackageAutoLoadFlags.BackgroundLoad)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    // Docked beside the Solution Explorer, as VS Code's sits in its explorer.
    [ProvideToolWindow(typeof(WorkExplorerWindow), Style = VsDockStyle.Tabbed, Window = "3ae79031-e1bc-11d0-8f78-00a0c9110057")]
    // On the right, under the Solution Explorer and the Work Explorer, as Dabbler Layout arranges it.
    [ProvideToolWindow(typeof(TerminalWindow), Style = VsDockStyle.Linked, Orientation = ToolWindowOrientation.Bottom, Window = "3ae79031-e1bc-11d0-8f78-00a0c9110057")]
    // Beside the Work Explorer, as VS Code's Configuration section sits under its tree.
    [ProvideToolWindow(typeof(ConfigurationWindow), Style = VsDockStyle.Tabbed, Window = "3ae79031-e1bc-11d0-8f78-00a0c9110057")]
    // A tab in the editor area, where a file opens: one per engine.
    [ProvideToolWindow(typeof(EngineWindow), Style = VsDockStyle.MDI, MultiInstances = true)]
    // Tools > Options > Dabbler > Engine: where an engine opens.
    [ProvideOptionPage(typeof(EngineOptionsPage), "Dabbler", "Engine", 0, 0, true)]
    [Guid(PackageGuidString)]
    public sealed class DabblerPackage : AsyncPackage
    {
        public const string PackageGuidString = "425b072f-e523-4795-9b61-5716674585bd";

        internal static readonly Guid CommandSet = new Guid("a9db3fec-b5ee-439b-acfe-21f711d1ec33");
        private const int VersionCommandId = 0x0100;
        private const int WorkExplorerCommandId = 0x0101;
        private const int TerminalCommandId = 0x0102;
        private const int ConfigurationCommandId = 0x0103;
        private const int EndEngineCommandId = 0x0105;
        private const int LayoutCommandId = 0x0106;

        /// <summary>The Work Explorer's toolbar, which carries Dabbler Layout's button.</summary>
        internal const int WorkExplorerToolbarId = 0x1030;

        private bool nodePassed;
        private NoticeWatcher? notices;
        private Router? router;

        /// <summary>The router the extension carries; null until the package has initialized.</summary>
        internal Router? Router => router;

        /// <summary>The Dabbler Commands pane; null until the package has initialized.</summary>
        internal CommandsPane? Commands { get; private set; }

        /// <summary>The Dabbler Session pane; null until the package has initialized.</summary>
        internal SessionPane? Session { get; private set; }

        /// <summary>Where Tools > Options > Dabbler > Engine says an engine opens.</summary>
        internal EnginePlace EnginePlace => ((EngineOptionsPage)GetDialogPage(typeof(EngineOptionsPage))).OpensIn;

        /// <summary>Whether Tools > Options > Dabbler > Engine says a session's start applies the Dabbler layout.</summary>
        internal bool LayoutAtStart => ((EngineOptionsPage)GetDialogPage(typeof(EngineOptionsPage))).LayoutAtStart;

        /// <summary>Every Dabbler Engine pane this Visual Studio has made, open or closed. Main thread only.</summary>
        internal List<EngineWindow> EngineWindows { get; } = new List<EngineWindow>();

        // The bars offering engines still running for the open solution's folder, by pipe. Main thread only.
        private readonly Dictionary<string, IVsInfoBarUIElement> engineOffers = new Dictionary<string, IVsInfoBarUIElement>(StringComparer.Ordinal);

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            var output = await GetServiceAsync(typeof(SVsOutputWindow)) as IVsOutputWindow
                ?? throw new InvalidOperationException("Visual Studio offered no Output window.");
            var bundle = Path.Combine(Path.GetDirectoryName(typeof(DabblerPackage).Assembly.Location)!, "router", "dabbler.cjs");
            Commands = CommandsPane.Create(output);
            Session = SessionPane.Create(output);
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
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(ShowConfigurationAsync).FileAndForget("dabbler/configuration"),
                new CommandID(CommandSet, ConfigurationCommandId)));
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(EndEngineAsync).FileAndForget("dabbler/engine/end"),
                new CommandID(CommandSet, EndEngineCommandId)));
            commands.AddCommand(new MenuCommand(
                (_, _) => JoinableTaskFactory.RunAsync(new DabblerLayoutCommand(this).RunAsync).FileAndForget("dabbler/layout"),
                new CommandID(CommandSet, LayoutCommandId)));
            notices = new NoticeWatcher(this);
            SolutionEvents.OnAfterOpenSolution += OnSolutionOpened;
            SolutionEvents.OnAfterCloseSolution += OnSolutionClosed;
            // The package loads once a solution is open, after that solution's opening was raised.
            JoinableTaskFactory.RunAsync(OfferRunningEnginesAsync).FileAndForget("dabbler/engine/offer");
        }

        private void OnSolutionOpened(object sender, OpenSolutionEventArgs e)
        {
            JoinableTaskFactory.RunAsync(OfferRunningEnginesAsync).FileAndForget("dabbler/engine/offer");
        }

        private void OnSolutionClosed(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            foreach (var bar in engineOffers.Values.ToList()) bar.Close();
            engineOffers.Clear();
        }

        /// <summary>
        /// Each engine still running for the open solution's repository, and
        /// attached to no pane of this Visual Studio, offered in a bar across
        /// the main window whose button opens its pane.
        /// </summary>
        private async Task OfferRunningEnginesAsync()
        {
            var folder = await SolutionFolderAsync();
            var root = folder == null ? null : WorkExplorerTree.RepositoryRootOf(folder);
            if (root == null) return;
            await TaskScheduler.Default;
            var running = EngineHost.Running(root);
            if (running.Count == 0) return;
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            if (!(await GetServiceAsync(typeof(SVsShell)) is IVsShell shell)) return;
            if (!(await GetServiceAsync(typeof(SVsInfoBarUIFactory)) is IVsInfoBarUIFactory factory)) return;
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            if (ErrorHandler.Failed(shell.GetProperty((int)__VSSPROPID7.VSSPROPID_MainWindowInfoBarHost, out var value))) return;
            if (!(value is IVsInfoBarHost host)) return;
            foreach (var record in running)
            {
                // Attached here already, or offered already: the package's first offer and a solution's opening can meet.
                if (EngineWindows.Any(window => window.Pipe == record.Pipe) || engineOffers.ContainsKey(record.Pipe)) continue;
                var model = new InfoBarModel(
                    new[] { new InfoBarTextSpan($"{record.Title} is still running for this folder.") },
                    new[] { new InfoBarButton("Open its pane") },
                    KnownMonikers.StatusInformation,
                    isCloseButtonVisible: true);
                var bar = factory.CreateInfoBar(model);
                var events = new OfferEvents(
                    () => JoinableTaskFactory.RunAsync(() => OpenEnginePaneAsync(record)).FileAndForget("dabbler/engine/reopen"),
                    _ => engineOffers.Remove(record.Pipe));
                bar.Advise(events, out events.Cookie);
                host.AddInfoBar(bar);
                engineOffers[record.Pipe] = bar;
            }
        }

        /// <summary>
        /// The tab of an engine still running: the one already attached to it
        /// brought forward, or a tab of its own attached to it.
        /// </summary>
        internal async Task OpenEnginePaneAsync(EngineRecord record)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            var attached = EngineWindows.FirstOrDefault(pane => pane.Pipe == record.Pipe);
            if (attached != null)
            {
                ErrorHandler.ThrowOnFailure(((IVsWindowFrame)attached.Frame).Show());
                return;
            }
            var (window, ticket, _) = await FreeEngineWindowAsync(record.Folder, record.Session);
            if (window == null) return;
            var failed = await window.AttachAsync(record, ticket);
            if (failed == null) return;
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            // The empty tab is not left open; the engine runs on, offered again by its row.
            ((IVsWindowFrame)window.Frame).CloseFrame((uint)__FRAMECLOSE.FRAMECLOSE_NoSave);
            Show($"{record.Title} is still running, but its tab could not be shown ({failed.TrimEnd('.')}).", OLEMSGICON.OLEMSGICON_WARNING);
        }

        /// <summary>
        /// A Dabbler Engine pane with no engine, reserved for the engine of
        /// <paramref name="session"/> in <paramref name="folder"/> and shown:
        /// one closed earlier, or a new one, with the ticket it is reserved
        /// under. Held, with no pane, where another
        /// opening has taken a tab for that session meanwhile: that tab is
        /// brought forward instead, since a session never has two engines.
        /// </summary>
        internal async Task<(EngineWindow? Window, int Ticket, bool Held)> FreeEngineWindowAsync(string folder, int? session)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            var window = EngineWindows.FirstOrDefault(pane => !pane.Busy);
            for (var id = 0; window == null; id++)
            {
                if (await FindToolWindowAsync(typeof(EngineWindow), id, create: false, DisposalToken) != null) continue;
                var made = await FindToolWindowAsync(typeof(EngineWindow), id, create: true, DisposalToken) as EngineWindow;
                if (made == null) return (null, 0, false);
                await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
                // Another opening may have made this one while this was waiting.
                if (!made.Busy) window = made;
            }
            var holder = session == null ? null : EngineWindows.FirstOrDefault(pane => pane != window && pane.Holds(folder, session.Value));
            if (holder != null)
            {
                ErrorHandler.ThrowOnFailure(((IVsWindowFrame)holder.Frame).Show());
                return (null, 0, true);
            }
            ErrorHandler.ThrowOnFailure(((IVsWindowFrame)window.Frame).Show());
            // Nothing awaits between choosing the pane and taking it; a pane that would not show is not taken.
            return (window, window.Reserve(folder, session), false);
        }

        /// <summary>A bar's button opens the engine's pane and closes the bar; a closed bar stops listening.</summary>
        private sealed class OfferEvents : IVsInfoBarUIEvents
        {
            private readonly Action open;
            private readonly Action<IVsInfoBarUIElement> closed;

            public OfferEvents(Action open, Action<IVsInfoBarUIElement> closed)
            {
                this.open = open;
                this.closed = closed;
            }

            public uint Cookie;

            public void OnActionItemClicked(IVsInfoBarUIElement infoBarUIElement, IVsInfoBarActionItem actionItem)
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                open();
                infoBarUIElement.Close();
            }

            public void OnClosed(IVsInfoBarUIElement infoBarUIElement)
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                infoBarUIElement.Unadvise(Cookie);
                closed(infoBarUIElement);
            }
        }

        /// <summary>
        /// Visual Studio is closing: where an Engine tab holds an engine, one
        /// sentence says it carries on, and Visual Studio closes. Nothing here
        /// stops it closing.
        /// </summary>
        protected override int QueryClose(out bool canClose)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            canClose = true;
            if (EngineWindows.Any(pane => pane.Pipe != null))
            {
                Show("The session carries on after Visual Studio closes, and its tab is offered when this solution is opened again.", OLEMSGICON.OLEMSGICON_INFO);
            }
            return VSConstants.S_OK;
        }

        protected override void Dispose(bool disposing)
        {
            // Visual Studio closes a package on its main thread, and only then disposes it.
#pragma warning disable VSTHRD010
            if (disposing) notices?.Dispose();
#pragma warning restore VSTHRD010
            if (disposing)
            {
                SolutionEvents.OnAfterOpenSolution -= OnSolutionOpened;
                SolutionEvents.OnAfterCloseSolution -= OnSolutionClosed;
            }
            notices = null;
            base.Dispose(disposing);
        }

        /// <summary>
        /// The Work Explorer shown with session <paramref name="session"/> of
        /// the repository at <paramref name="root"/> selected, where it shows
        /// that repository; shown as it is where the session is not named.
        /// </summary>
        internal async Task ShowWorkExplorerAtAsync(string root, string? session)
        {
            var window = await ShowToolWindowAsync(typeof(WorkExplorerWindow), 0, create: true, DisposalToken);
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            if (session != null && window is WorkExplorerWindow explorer) explorer.Reveal(root, session);
        }

        /// <summary>View > Other Windows > Dabbler Configuration.</summary>
        private async Task ShowConfigurationAsync()
        {
            await ShowToolWindowAsync(typeof(ConfigurationWindow), 0, create: true, DisposalToken);
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
        /// Session <paramref name="session"/> of the repository at
        /// <paramref name="root"/> has closed: each tab holding its engine
        /// ends that engine and closes, as VS Code closes a finished session's
        /// terminal, and an engine of it whose tab was closed is ended too.
        /// </summary>
        internal void EndSessionEngines(string root, string? session)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var tabs = EngineWindows.Where(pane => EngineOpening.Closes(pane.Folder, pane.Session, root, session)).ToList();
            var held = new HashSet<string>(tabs.Select(pane => pane.Pipe).OfType<string>());
            foreach (var window in tabs) window.EndAndClose();
            JoinableTaskFactory.RunAsync(async () =>
            {
                await TaskScheduler.Default;
                foreach (var record in EngineOpening.Ends(EngineHost.Running(root), root, session).Where(record => !held.Contains(record.Pipe))) EngineHost.End(record);
            }).FileAndForget("dabbler/engine/end-session");
        }

        /// <summary>
        /// The tab that has, or is starting, the engine of session
        /// <paramref name="session"/> of the repository at <paramref name="root"/>,
        /// brought forward; false where no tab of this Visual Studio has it.
        /// </summary>
        internal async Task<bool> ShowEngineTabAsync(string root, int session)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            var window = EngineWindows.FirstOrDefault(pane => pane.Holds(root, session));
            if (window == null) return false;
            ErrorHandler.ThrowOnFailure(((IVsWindowFrame)window.Frame).Show());
            return true;
        }

        /// <summary>
        /// Tools > Dabbler: End Engine -- ends the engine of the Dabbler
        /// Engine pane in front, or of the only one with an engine, which
        /// closing a pane does not.
        /// </summary>
        private async Task EndEngineAsync()
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            object? active = null;
            if (await GetServiceAsync(typeof(SVsShellMonitorSelection)) is IVsMonitorSelection selection)
            {
                await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
                selection.GetCurrentElementValue((uint)VSConstants.VSSELELEMID.SEID_WindowFrame, out active);
            }
            var attached = EngineWindows.Where(pane => pane.Pipe != null).ToList();
            var window = attached.FirstOrDefault(pane => ReferenceEquals(pane.Frame, active)) ?? (attached.Count == 1 ? attached[0] : null);
            if (window == null || !window.End())
            {
                var text = attached.Count > 1
                    ? "More than one engine is running here: click into the Dabbler Engine pane of the one to end, then end it."
                    : "No engine is running in a Dabbler Engine pane of this window.";
                Show(text, OLEMSGICON.OLEMSGICON_INFO);
            }
        }

        /// <summary>
        /// Says a verb's success in an information bar on the Work Explorer,
        /// or in a message box where that window is not open.
        /// </summary>
        internal async Task SayDoneAsync(string text)
        {
            var window = await FindToolWindowAsync(typeof(WorkExplorerWindow), 0, create: false, DisposalToken);
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            if (window is WorkExplorerWindow explorer) explorer.Say(text);
            else Show(text, OLEMSGICON.OLEMSGICON_INFO);
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
