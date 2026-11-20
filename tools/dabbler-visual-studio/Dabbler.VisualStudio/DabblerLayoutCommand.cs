using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using EnvDTE;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Tools > Dabbler: Layout, its key and the Work Explorer's button. The
    /// first use records the developer's arrangement as a window
    /// configuration, which Visual Studio puts back exactly and which never
    /// joins the layouts Window > Apply Window Layout lists, and then
    /// arranges Dabbler's windows: the Work Explorer beside the Solution
    /// Explorer, the session's engine in the middle, the Dabbler Terminal on
    /// the right. The next use puts the recorded arrangement back, and ends
    /// no engine. A window moves only where its registration puts it the
    /// first time a profile shows it; no call re-docks a window already
    /// placed (docs/uat/uat-visual-studio.md section 9).
    /// </summary>
    internal sealed class DabblerLayoutCommand
    {
        private readonly DabblerPackage package;

        public DabblerLayoutCommand(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>The command: the layout applied, or the developer's windows put back.</summary>
        public Task RunAsync() => UseAsync(atStart: false);

        /// <summary>
        /// A session's engine has opened: the layout applied where Tools >
        /// Options says a start applies it, as the command would, so the
        /// command's next use goes back.
        /// </summary>
        public Task StartedAsync() => UseAsync(atStart: true);

        private async Task UseAsync(bool atStart)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync(package.DisposalToken);
            if (!(await package.GetServiceAsync(typeof(SDTE)) is DTE dte)) return;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync(package.DisposalToken);
            var configurations = dte.WindowConfigurations;
            var names = new List<string>();
            foreach (WindowConfiguration each in configurations) names.Add(each.Name);
            if (atStart && !DabblerLayout.AtStart(package.LayoutAtStart, names)) return;
            var use = DabblerLayout.Use(names, configurations.ActiveConfigurationName);
            if (use.Move == LayoutMove.GoBack)
            {
                GoBack(configurations, use);
                return;
            }
            try
            {
                configurations.Add(use.Record);
            }
            catch (COMException error)
            {
                // Nothing is moved that could not be put back.
                Say($"Your windows could not be recorded, so nothing was moved ({error.Message.TrimEnd('.')}).");
                return;
            }
            await ApplyAsync();
        }

        /// <summary>
        /// The Dabbler windows shown, the engine's tab last so that it is the
        /// one in front.
        /// </summary>
        private async Task ApplyAsync()
        {
            await package.ShowToolWindowAsync(typeof(WorkExplorerWindow), 0, create: true, package.DisposalToken);
            await package.ShowToolWindowAsync(typeof(TerminalWindow), 0, create: true, package.DisposalToken);
            await package.JoinableTaskFactory.SwitchToMainThreadAsync(package.DisposalToken);
            var attached = package.EngineWindows.Where(pane => pane.Pipe != null).ToList();
            var engine = attached.FirstOrDefault(pane => pane.Session != null) ?? attached.FirstOrDefault();
            if (engine != null) ErrorHandler.ThrowOnFailure(((IVsWindowFrame)engine.Frame).Show());
        }

        /// <summary>
        /// The arrangement recorded before the layout, put back exactly and
        /// the record forgotten. The active configuration takes in whatever
        /// is moved while it is active, so the record is applied, the
        /// configuration it was recorded over takes it in and becomes active
        /// again, and only then is the record deleted: deleting it while it
        /// is active would re-apply the moved arrangement. An Engine tab the
        /// record does not know is shown again, so no engine loses its tab.
        /// </summary>
        private void GoBack(WindowConfigurations configurations, LayoutUse use)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var showing = new List<IVsWindowFrame>();
            foreach (var pane in package.EngineWindows)
            {
                if (pane.Pipe != null && pane.Frame is IVsWindowFrame frame && frame.IsVisible() == VSConstants.S_OK) showing.Add(frame);
            }
            try
            {
                configurations.Item(use.Record).Apply(true);
                var over = configurations.Item(use.Over);
                over.Update();
                over.Apply(true);
                configurations.Item(use.Record).Delete();
            }
            catch (COMException error)
            {
                Say($"Your windows could not be put back ({error.Message.TrimEnd('.')}).");
            }
            foreach (var frame in showing) frame.ShowNoActivate();
        }

        private void Say(string text)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            VsShellUtilities.ShowMessageBox(package, text, "Dabbler", OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
