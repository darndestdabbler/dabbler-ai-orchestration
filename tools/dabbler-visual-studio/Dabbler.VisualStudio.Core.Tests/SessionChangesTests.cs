using System.Linq;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class SessionChangesTests
    {
        private const string Log =
            "e5\tTranscript for session 358\n" +
            "e4\tClose session 358 of sessions\n" +
            "e3\tSession 358: Visual Studio says when a session needs a person\n" +
            "e2\tTranscript for session 3580\n" +
            "e1\tSession 35: Something older\n" +
            "e0\tPlan: 363\n";

        [Fact]
        public void Range_is_the_parent_of_the_earliest_own_commit_to_the_latest()
        {
            var range = SessionChanges.Range(Log, 358);
            Assert.NotNull(range);
            Assert.Equal("e2", range!.Start);
            Assert.Equal("e5", range.End);
            Assert.Equal("e0", SessionChanges.Range(Log, 35)!.Start);
        }

        [Fact]
        public void Range_is_null_for_a_session_with_no_commit_of_its_own()
        {
            Assert.Null(SessionChanges.Range(Log, 359));
        }

        [Fact]
        public void Files_reads_each_change_and_a_rename_from_its_old_path()
        {
            var files = SessionChanges.Files("M\tsrc/a.cs\r\nA\tsrc/b.cs\nD\tsrc/c.cs\nR097\told/d.cs\tnew/d.cs\n");
            Assert.Equal(new[] { "src/a.cs", "src/b.cs", "src/c.cs", "new/d.cs" }, files.Select(file => file.Path));
            Assert.Equal(new[] { FileChange.Modified, FileChange.Added, FileChange.Deleted, FileChange.Renamed }, files.Select(file => file.Change));
            Assert.Equal("old/d.cs", files[3].OldPath);
            Assert.Equal("renamed from old/d.cs", files[3].Description);
        }
    }
}
