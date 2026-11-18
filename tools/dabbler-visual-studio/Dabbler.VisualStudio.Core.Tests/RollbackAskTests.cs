using System;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class RollbackAskTests
    {
        private const string DryRun = "{\"session\": 7, \"through\": 7, \"head\": \"abc123\", \"commits\": 0, \"detail\": \"Session 7 is undone: the session returns to not-started. The session plan is kept.\"}\n";

        private static WorkExplorerAction Action(object shape)
        {
            return JsonConvert.DeserializeObject<WorkExplorerAction>(JsonConvert.SerializeObject(shape))!;
        }

        private static readonly WorkExplorerAction Rollback = Action(new
        {
            id = "dabblerSessionSets.rollback",
            title = "Rollback to Start of This Session",
            argv = new[] { "dabbler", "session", "rollback", "--sessions-dir", "s", "--session-number", "7", "--reason", "from the Work Explorer" },
            preview = new[] { "dabbler", "session", "rollback", "--sessions-dir", "s", "--session-number", "7", "--reason", "from the Work Explorer", "--dry-run" },
            confirm = new { title = "Roll back to the start of session 7?", accept = "Roll Back", keep = "Keep" },
        });

        private static readonly WorkExplorerAction ReportStop = Action(new
        {
            id = "dabbler.reportStop",
            title = "Report this stop to Dabbler",
            argv = new[] { "dabbler", "session", "defect-report", "--sessions-dir", "s" },
        });

        [Fact]
        public void Ask_offers_the_report_first_where_a_stop_stands()
        {
            var atStop = RollbackAsk.Ask(Rollback, new[] { Rollback, ReportStop }, DryRun);
            Assert.Equal(new[] { RollbackAsk.ReportFirst, "Roll Back", "Keep" }, atStop.Choices);
            Assert.Same(ReportStop, atStop.Report);
            Assert.StartsWith("Session 7 is undone", atStop.Detail);
            Assert.Contains("nothing is sent", atStop.Detail);

            var noStop = RollbackAsk.Ask(Rollback, new[] { Rollback }, DryRun);
            Assert.Equal(new[] { "Roll Back", "Keep" }, noStop.Choices);
            Assert.Null(noStop.Report);
            Assert.Equal("Session 7 is undone: the session returns to not-started. The session plan is kept.", noStop.Detail);
            Assert.Equal("Roll back to the start of session 7?", noStop.Title);
            Assert.Equal(
                new[] { "session", "rollback", "--sessions-dir", "s", "--session-number", "7", "--reason", "from the Work Explorer", "--as-of", "abc123" },
                noStop.Arguments);

            Assert.Throws<FormatException>(() => RollbackAsk.Ask(Rollback, new[] { Rollback }, "{\"session\": 7}"));
        }
    }
}
