using System.Linq;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class TerminalRowsTests
    {
        private const string Rule = "{\"kind\":\"rule\",\"label\":\"352 ─ framework\"}";

        private const string Passed =
            "{\"kind\":\"line\",\"at\":\"2026-11-18T10:11:23.000Z\",\"clock\":\"05:11:23\",\"event\":\"plan-accepted\",\"fields\":{\"steps\":\"4\"},\"voice\":\"352 ─ framework\"," +
            "\"spans\":[{\"text\":\"05:11:23\",\"tone\":\"muted\",\"bold\":false},{\"text\":\" \",\"tone\":\"plain\",\"bold\":false}," +
            "{\"text\":\"plan-accepted\",\"tone\":\"good\",\"bold\":true},{\"text\":\" \",\"tone\":\"plain\",\"bold\":false}," +
            "{\"text\":\"steps=\",\"tone\":\"muted\",\"bold\":false},{\"text\":\"4\",\"tone\":\"plain\",\"bold\":false}]}";

        private const string Phase =
            "{\"kind\":\"line\",\"at\":null,\"clock\":\"05:11:24\",\"event\":\"phase\",\"fields\":{},\"voice\":\"352 ─ framework\"," +
            "\"spans\":[{\"text\":\"05:11:24\",\"tone\":\"muted\",\"bold\":false},{\"text\":\" \",\"tone\":\"plain\",\"bold\":false}," +
            "{\"text\":\"phase\",\"tone\":\"muted\",\"bold\":false}]}";

        private const string Notice =
            "{\"kind\":\"notice\",\"notice\":\"instruction-overdue\",\"step\":\"window\",\"seq\":\"2\",\"outstandingSeconds\":600,\"message\":\"overdue\"}";

        [Fact]
        public void Add_turns_a_stream_of_lines_into_rows_in_order_with_a_tone_on_each_piece()
        {
            var terminal = new TerminalRows();
            foreach (var line in new[] { Rule, Passed, Phase, Notice }) terminal.Add(line);

            Assert.Equal(3, terminal.Rows.Count);

            var heading = terminal.Rows[0];
            Assert.True(heading.IsHeading);
            Assert.Null(heading.Clock);
            var label = Assert.Single(heading.Pieces);
            Assert.Equal(("352 ─ framework", "milestone", true), (label.Text, label.Tone, label.Bold));

            var passed = terminal.Rows[1];
            Assert.False(passed.IsHeading);
            Assert.Equal(("05:11:23", "muted"), (passed.Clock!.Text, passed.Clock.Tone));
            Assert.Equal(
                new[] { ("plan-accepted", "good", true), (" ", "plain", false), ("steps=", "muted", false), ("4", "plain", false) },
                passed.Pieces.Select(piece => (piece.Text, piece.Tone, piece.Bold)));
            Assert.Equal("05:11:23 plan-accepted steps=4", passed.Text);

            var phase = terminal.Rows[2];
            Assert.Equal("05:11:24", phase.Clock!.Text);
            Assert.Equal(new[] { ("phase", "muted") }, phase.Pieces.Select(piece => (piece.Text, piece.Tone)));
        }

        private static string Output(string text, bool eol) =>
            "{\"kind\":\"output\",\"voice\":\"352 ─ run-of-record-visual-studio\",\"text\":\"" + text + "\",\"eol\":" + (eol ? "true" : "false") + "}";

        [Fact]
        public void Add_marks_a_jobs_output_and_joins_a_line_it_had_not_ended()
        {
            var terminal = new TerminalRows();
            foreach (var line in new[] { Phase, Output("ok 1", true), Output("not ", false), Output("ok 2", true) }) terminal.Add(line);

            Assert.Equal(3, terminal.Rows.Count);
            Assert.False(terminal.Rows[0].IsJobOutput);
            foreach (var (row, text) in terminal.Rows.Skip(1).Zip(new[] { "ok 1", "not ok 2" }))
            {
                Assert.True(row.IsJobOutput);
                Assert.Null(row.Clock);
                var piece = Assert.Single(row.Pieces);
                Assert.Equal((text, "plain", false), (piece.Text, piece.Tone, piece.Bold));
            }
        }
    }
}
