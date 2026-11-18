using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>The router's ids of the actions that do more than open a file.</summary>
    public static class ActionIds
    {
        public const string StartSession = "dabblerSessionSets.startSession";
        public const string ConsultWithAi = "dabbler.consultWithAi";
        public const string OpenMechanic = "dabbler.openMechanic";
        public const string StopSession = "dabblerSessionSets.stopSession";
        public const string ContinueSession = "dabblerSessionSets.continueSession";
        public const string CloseSession = "dabblerSessionSets.closeSession";
        public const string CancelSession = "dabblerSessionSets.cancel";
        public const string RestoreSession = "dabblerSessionSets.restore";
        public const string ReportStop = "dabbler.reportStop";
        public const string Rollback = "dabblerSessionSets.rollback";
        public const string CheckStop = "dabbler.checkStop";
        public const string ReviewException = "dabbler.reviewException";
    }

    /// <summary>One row as the tree shows it: the router's words, made plain, and whether it is open or selected.</summary>
    public sealed class WorkExplorerNode : INotifyPropertyChanged
    {
        private static readonly Regex IconToken = new Regex(@"\$\([A-Za-z0-9~-]+\)\s?");

        /// <summary>
        /// The actions this extension runs. The router offers more; one whose
        /// Visual Studio half is not built yet is not shown, because a menu
        /// item that does nothing is worse than none.
        /// </summary>
        internal static readonly IReadOnlyCollection<string> RunnableActions = new HashSet<string>
        {
            "dabblerSessionSets.openSpec",
            "dabblerSessionSets.openActivityLog",
            "dabblerSessionSets.openChangeLog",
            "dabblerSessionSets.openSessionState",
            "dabbler.openTranscript",
            ActionIds.StartSession,
            ActionIds.ConsultWithAi,
            ActionIds.OpenMechanic,
            ActionIds.StopSession,
            ActionIds.ContinueSession,
            ActionIds.CloseSession,
            ActionIds.CancelSession,
            ActionIds.RestoreSession,
            ActionIds.ReportStop,
            ActionIds.Rollback,
            ActionIds.CheckStop,
            ActionIds.ReviewException,
        };

        private bool isExpanded;
        private bool isSelected;

        internal WorkExplorerNode(WorkExplorerRow row)
        {
            Row = row;
            Label = IconToken.Replace(row.Label, "").Trim();
            Tooltip = PlainText(row.Tooltip);
            Children = row.Children.Select(child => new WorkExplorerNode(child)).ToList();
            Actions = row.Actions.Where(action => RunnableActions.Contains(action.Id)).ToList();
            isExpanded = row.Collapsible == "expanded";
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        public WorkExplorerRow Row { get; }

        public string Id => Row.Id;

        /// <summary>The row's label, with any `$(name)` icon in it left out.</summary>
        public string Label { get; }

        public string? Description => Row.Description;

        /// <summary>The row's markdown tooltip as plain text, or null where the row has none.</summary>
        public string? Tooltip { get; }

        public WorkExplorerIcon? Icon => Row.Icon;

        public IReadOnlyList<WorkExplorerNode> Children { get; }

        /// <summary>The row's actions this extension runs, in the order the router gave them: the row's context menu.</summary>
        public IReadOnlyList<WorkExplorerAction> Actions { get; }

        /// <summary>
        /// The session's number where the row is a complete session, which
        /// offers Compare With Its Start; null on every other row.
        /// </summary>
        public int? CompleteSession
        {
            get
            {
                if (Row.Kind != "session" || !Row.ContextValue.Contains(";session-complete;")) return null;
                var slash = Row.Id.LastIndexOf('/');
                return slash >= 0 && int.TryParse(Row.Id.Substring(slash + 1), out var number) ? number : (int?)null;
            }
        }

        public bool IsExpanded
        {
            get => isExpanded;
            set => Set(ref isExpanded, value, nameof(IsExpanded));
        }

        public bool IsSelected
        {
            get => isSelected;
            set => Set(ref isSelected, value, nameof(IsSelected));
        }

        private void Set(ref bool field, bool value, string name)
        {
            if (field == value) return;
            field = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }

        private static string? PlainText(string? markdown)
        {
            if (markdown == null) return null;
            var plain = IconToken.Replace(markdown, "").Replace("**", "").Replace("`", "").Trim();
            return plain.Length > 0 ? plain : null;
        }
    }

    /// <summary>The Work Explorer's tree: the nodes of the last document the router printed.</summary>
    public sealed class WorkExplorerTree : INotifyPropertyChanged
    {
        private const string WhatThisShows = "This shows the work: which session is running, which step it is on, and anything waiting on you.";

        /// <summary>Shown where no solution is open.</summary>
        public const string NoSolution = WhatThisShows + "\n\nNo solution is open. Open a solution that is in a git repository to see its sessions.";

        /// <summary>Shown where the open solution is in no git repository.</summary>
        public const string NotInRepository = WhatThisShows + "\n\nThis solution is not in a git repository, so it has no sessions to show. Put it in one first (git init in the solution's folder, then commit), and Set Up Dabbler in This Solution is offered here.";

        /// <summary>Shown where the repository has no session plan: the one sentence that carries the set-up button.</summary>
        public const string NoSessionPlan = WhatThisShows + "\n\nThis repository is not set up for Dabbler yet. Setting it up installs nothing: it writes the guidance files, the ignore rule and the first two sessions, and commits them.";

        private string? message;

        public event PropertyChangedEventHandler? PropertyChanged;

        public ObservableCollection<WorkExplorerNode> Roots { get; } = new ObservableCollection<WorkExplorerNode>();

        /// <summary>What the window says instead of a tree, or null where it shows the tree.</summary>
        public string? Message
        {
            get => message;
            set
            {
                if (message == value) return;
                message = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Message)));
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(OffersSetUp)));
            }
        }

        /// <summary>Whether the window offers Set Up Dabbler in This Solution: exactly while the repository has no session plan.</summary>
        public bool OffersSetUp => Message == NoSessionPlan;

        /// <summary>
        /// The first Start Session action in <paramref name="document"/>, its
        /// rows walked in order: once a repository is set up, session 1's.
        /// Null where no row offers one.
        /// </summary>
        public static WorkExplorerAction? FirstStart(WorkExplorerDocument document)
        {
            return WalkRows(document.Repositories)
                .SelectMany(row => row.Actions)
                .FirstOrDefault(action => action.Id == ActionIds.StartSession);
        }

        private static IEnumerable<WorkExplorerRow> WalkRows(IEnumerable<WorkExplorerRow> rows)
        {
            foreach (var row in rows)
            {
                yield return row;
                foreach (var below in WalkRows(row.Children)) yield return below;
            }
        }

        /// <summary>
        /// Replaces the tree with <paramref name="document"/>'s rows, keeping a
        /// developer's place by the rows' ids: a row seen before is open
        /// exactly when it was, whatever its row says now, and the selected
        /// row stays selected. A row not seen before starts as its row says.
        /// A document naming no repository is a repository with no session
        /// plan, and says so in <see cref="Message"/>.
        /// </summary>
        public void Show(WorkExplorerDocument document)
        {
            var wasOpen = new Dictionary<string, bool>();
            string? selected = null;
            foreach (var node in Walk(Roots))
            {
                wasOpen[node.Id] = node.IsExpanded;
                if (node.IsSelected) selected = node.Id;
            }
            var nodes = document.Repositories.Select(row => new WorkExplorerNode(row)).ToList();
            foreach (var node in Walk(nodes))
            {
                if (wasOpen.TryGetValue(node.Id, out var open)) node.IsExpanded = open;
                node.IsSelected = node.Id == selected;
            }
            Roots.Clear();
            foreach (var node in nodes) Roots.Add(node);
            Message = nodes.Count == 0 ? NoSessionPlan : null;
        }

        /// <summary>
        /// Selects the row of session <paramref name="session"/> (a label such
        /// as 358 or 007) of the repository at <paramref name="repositoryRoot"/>,
        /// opening every row above it; false where the tree shows no such row.
        /// </summary>
        public bool Reveal(string repositoryRoot, string session)
        {
            if (!int.TryParse(session, out var number)) return false;
            var root = SamePath(repositoryRoot);
            foreach (var path in Paths(Roots, new List<WorkExplorerNode>()))
            {
                var node = path[path.Count - 1];
                if (!node.Id.StartsWith("session:", StringComparison.Ordinal)) continue;
                var slash = node.Id.LastIndexOf('/');
                if (slash < 0 || !int.TryParse(node.Id.Substring(slash + 1), out var found) || found != number) continue;
                if (!string.Equals(SamePath(node.Id.Substring("session:".Length, slash - "session:".Length)), root, StringComparison.OrdinalIgnoreCase)) continue;
                foreach (var above in path.Take(path.Count - 1)) above.IsExpanded = true;
                foreach (var other in Walk(Roots)) other.IsSelected = other == node;
                return true;
            }
            return false;
        }

        /// <summary>A path as it compares: full, with one kind of slash and none at the end.</summary>
        private static string SamePath(string path) =>
            Path.GetFullPath(path).Replace('\\', '/').TrimEnd('/');

        /// <summary>Every node, with the nodes above it, outermost first.</summary>
        private static IEnumerable<List<WorkExplorerNode>> Paths(IEnumerable<WorkExplorerNode> nodes, List<WorkExplorerNode> above)
        {
            foreach (var node in nodes)
            {
                var path = new List<WorkExplorerNode>(above) { node };
                yield return path;
                foreach (var below in Paths(node.Children, path)) yield return below;
            }
        }

        private static IEnumerable<WorkExplorerNode> Walk(IEnumerable<WorkExplorerNode> nodes)
        {
            foreach (var node in nodes)
            {
                yield return node;
                foreach (var below in Walk(node.Children)) yield return below;
            }
        }

        /// <summary>
        /// The nearest folder at or above <paramref name="folder"/> holding a
        /// `.git` directory or file (a worktree's), or null where there is none.
        /// </summary>
        public static string? RepositoryRootOf(string folder)
        {
            for (var current = new DirectoryInfo(folder); current != null; current = current.Parent)
            {
                var git = Path.Combine(current.FullName, ".git");
                if (Directory.Exists(git) || File.Exists(git)) return current.FullName;
            }
            return null;
        }
    }
}
