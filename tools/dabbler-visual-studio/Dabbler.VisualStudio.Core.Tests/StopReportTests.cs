using System.IO;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class StopReportTests
    {
        [Fact]
        public void Arguments_asks_for_json_and_says_a_rollback_follows_only_where_one_does()
        {
            var action = JsonConvert.DeserializeObject<WorkExplorerAction>(JsonConvert.SerializeObject(new
            {
                id = "dabbler.reportStop",
                title = "Report this stop to Dabbler",
                argv = new[] { "dabbler", "session", "defect-report", "--sessions-dir", "docs/sessions" },
            }))!;

            Assert.Equal(new[] { "session", "defect-report", "--sessions-dir", "docs/sessions", "--json" }, StopReport.Arguments(action, false));
            Assert.Equal(new[] { "session", "defect-report", "--sessions-dir", "docs/sessions", "--json", "--rolling-back" }, StopReport.Arguments(action, true));
        }

        [Fact]
        public void Written_reads_the_file_under_the_root_and_the_address()
        {
            var root = Path.Combine(Path.GetTempPath(), "repo");

            var written = StopReport.Written(root, "{\"file\":\".dabbler/reports/s3-x.md\",\"reports_to\":\"https://example.test/report\",\"said\":\"x\"}\n");
            Assert.Equal(Path.GetFullPath(Path.Combine(root, ".dabbler", "reports", "s3-x.md")), written.File);
            Assert.Equal("https://example.test/report", written.ReportsTo);

            Assert.Null(StopReport.Written(root, "{\"file\":\"r.md\",\"reports_to\":null,\"said\":\"\"}").ReportsTo);
            Assert.Throws<System.FormatException>(() => StopReport.Written(root, "{\"file\":null}"));
        }
    }
}
