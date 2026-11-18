using Dabbler.VisualStudio.Core;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Runs the action a developer chose on a Work Explorer row, by what it
    /// does: a file it opens, the session, consult or Mechanic it starts, or
    /// a person's verb on a session.
    /// The Work Explorer offers no other action (see WorkExplorerNode.Actions).
    /// </summary>
    internal sealed class RowActions
    {
        private readonly DabblerPackage package;

        public RowActions(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Runs <paramref name="action"/> for the repository at <paramref name="repositoryRoot"/>.</summary>
        public async Task RunAsync(string repositoryRoot, WorkExplorerAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (action.Opens != null)
            {
                FileOpener.Open(package, action.Opens);
                return;
            }
            switch (action.Id)
            {
                case ActionIds.StartSession:
                case ActionIds.ContinueSession:
                    await new SessionStarter(package).StartAsync(repositoryRoot, action);
                    return;
                case ActionIds.StopSession:
                case ActionIds.CloseSession:
                case ActionIds.CancelSession:
                case ActionIds.RestoreSession:
                    await new LifecycleActions(package).RunAsync(repositoryRoot, action);
                    return;
                case ActionIds.ConsultWithAi:
                case ActionIds.OpenMechanic:
                    await new EngineTab(package).OpenAsync(repositoryRoot, action);
                    return;
            }
        }
    }
}
