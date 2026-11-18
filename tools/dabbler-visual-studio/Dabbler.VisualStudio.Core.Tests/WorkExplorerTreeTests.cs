using System;
using System.IO;
using System.Linq;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class WorkExplorerTreeTests
    {
        private static object Row(string id, string kind, string label, string? description, string? tooltip, string collapsible, params object[] children)
        {
            return new
            {
                id,
                kind,
                label,
                description,
                tooltip,
                icon = (object?)null,
                collapsible,
                contextValue = $";{kind};",
                click = (object?)null,
                actions = Array.Empty<object>(),
                children,
            };
        }

        private static WorkExplorerDocument Document(params object[] repositories)
        {
            return WorkExplorerDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, repositories }));
        }

        private static WorkExplorerDocument TwoBuckets()
        {
            return Document(Row("repository:R", "repository", "repo", null, null, "expanded",
                Row("bucket:R/in-progress", "bucket", "In Progress", "1", "**In Progress**\n\n1 session", "expanded",
                    Row("session:R/7", "session", "$(sync~spin) 7: Rows", "step 2 of 4", "**Session 7** is on `rows`", "none")),
                Row("bucket:R/done", "bucket", "Done", "1", "**Done**", "collapsed",
                    Row("session:R/6", "session", "6: Before", null, null, "none"))));
        }

        [Fact]
        public void Show_builds_the_buckets_and_sessions_a_document_names()
        {
            var tree = new WorkExplorerTree();
            tree.Show(TwoBuckets());

            var repository = Assert.Single(tree.Roots);
            Assert.Equal("repo", repository.Label);
            Assert.Null(repository.Tooltip);
            Assert.Equal(new[] { "In Progress", "Done" }, repository.Children.Select(b => b.Label));

            var inProgress = repository.Children[0];
            Assert.True(inProgress.IsExpanded);
            Assert.Equal("1", inProgress.Description);
            Assert.Equal("In Progress\n\n1 session", inProgress.Tooltip);
            var running = Assert.Single(inProgress.Children);
            Assert.Equal("session:R/7", running.Id);
            Assert.Equal("7: Rows", running.Label);
            Assert.Equal("step 2 of 4", running.Description);
            Assert.Equal("Session 7 is on rows", running.Tooltip);

            var done = repository.Children[1];
            Assert.False(done.IsExpanded);
            Assert.Equal("6: Before", Assert.Single(done.Children).Label);
        }

        [Fact]
        public void Show_keeps_the_rows_a_developer_opened_and_selected()
        {
            var tree = new WorkExplorerTree();
            tree.Show(TwoBuckets());
            var before = tree.Roots[0];
            before.Children[1].IsExpanded = true;
            before.Children[0].IsExpanded = false;
            before.Children[1].Children[0].IsSelected = true;

            tree.Show(Document(Row("repository:R", "repository", "repo", null, null, "expanded",
                Row("bucket:R/in-progress", "bucket", "In Progress", "1", null, "expanded",
                    Row("session:R/8", "session", "8: Next", null, null, "expanded")),
                Row("bucket:R/done", "bucket", "Done", "2", null, "collapsed",
                    Row("session:R/7", "session", "7: Rows", null, null, "none"),
                    Row("session:R/6", "session", "6: Before", null, null, "none")))));

            var after = tree.Roots[0];
            Assert.False(after.Children[0].IsExpanded);
            Assert.True(after.Children[1].IsExpanded);
            var fresh = after.Children[0].Children[0];
            Assert.True(fresh.IsExpanded);
            Assert.False(fresh.IsSelected);
            Assert.Equal(new[] { false, true }, after.Children[1].Children.Select(s => s.IsSelected));
        }

        [Fact]
        public void Show_says_what_to_do_when_the_document_names_no_repository()
        {
            var tree = new WorkExplorerTree();
            tree.Show(TwoBuckets());
            Assert.Null(tree.Message);

            tree.Show(Document());

            Assert.Empty(tree.Roots);
            Assert.Equal(WorkExplorerTree.NoSessionPlan, tree.Message);
            Assert.Contains("not set up for Dabbler", tree.Message);

            tree.Show(TwoBuckets());
            Assert.Null(tree.Message);
        }

        [Fact]
        public void OffersSetUp_only_for_a_document_with_no_plan()
        {
            var tree = new WorkExplorerTree();
            tree.Show(Document());
            Assert.True(tree.OffersSetUp);

            tree.Show(TwoBuckets());
            Assert.False(tree.OffersSetUp);

            tree.Message = WorkExplorerTree.NotInRepository;
            Assert.False(tree.OffersSetUp);
        }

        [Fact]
        public void FirstStart_finds_session_1s_start_session()
        {
            var start = new { id = "dabblerSessionSets.startSession", title = "Start Session", argv = new[] { "dabbler", "session", "start", "--sessions-dir", "docs/sessions" } };
            var session1 = new
            {
                id = "session:R/1",
                kind = "session",
                label = "1: Plan",
                collapsible = "none",
                actions = new object[] { new { id = "dabbler.consultWithAi", title = "Consult with AI", argv = new[] { "dabbler", "consult" } }, start },
            };
            var document = Document(Row("repository:R", "repository", "repo", null, null, "expanded",
                new { id = "bucket:R/not-started", kind = "bucket", label = "Not Started", collapsible = "expanded", children = new[] { session1 } }));

            var found = WorkExplorerTree.FirstStart(document);

            Assert.NotNull(found);
            Assert.Equal("Start Session", found!.Title);
            Assert.Equal(start.argv, found.Argv);
            Assert.Null(WorkExplorerTree.FirstStart(TwoBuckets()));
        }

        [Fact]
        public void Actions_shows_only_the_actions_this_extension_runs()
        {
            object Action(string id, string title) => new { id, title, argv = new[] { "dabbler", "session" } };
            var session = new
            {
                id = "session:R/7",
                kind = "session",
                label = "7: Rows",
                collapsible = "none",
                actions = new[]
                {
                    Action("dabblerSessionSets.startSession", "Start Session"),
                    Action("dabbler.notBuiltHere", "Not Built Here"),
                    Action("dabbler.consultWithAi", "Consult with AI"),
                    Action("dabbler.alsoNotBuiltHere", "Also Not Built Here"),
                },
            };
            var tree = new WorkExplorerTree();
            tree.Show(Document(Row("repository:R", "repository", "repo", null, null, "expanded", session)));

            var node = Assert.Single(tree.Roots[0].Children);
            Assert.Equal(new[] { "Start Session", "Consult with AI" }, node.Actions.Select(a => a.Title));
            Assert.Empty(tree.Roots[0].Actions);
        }

        [Fact]
        public void RepositoryRootOf_finds_the_git_folder_above()
        {
            var root = Path.Combine(Path.GetTempPath(), "dabbler-root-" + Guid.NewGuid().ToString("N"));
            var nested = Path.Combine(root, "src", "App");
            Directory.CreateDirectory(nested);
            Directory.CreateDirectory(Path.Combine(root, ".git"));
            try
            {
                Assert.Equal(root, WorkExplorerTree.RepositoryRootOf(nested));
                Assert.Equal(root, WorkExplorerTree.RepositoryRootOf(root));
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }
}
