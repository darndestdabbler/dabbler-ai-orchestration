using System.Collections.Generic;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class ActionAskTests
    {
        private static WorkExplorerAction Action(string dismissed, string? blank, bool confirm = true)
        {
            return JsonConvert.DeserializeObject<WorkExplorerAction>(JsonConvert.SerializeObject(new
            {
                id = "dabblerSessionSets.cancel",
                title = "Cancel Session",
                argv = new[] { "dabbler", "session", "cancel", "--session-number", "7" },
                confirm = confirm ? new { title = "Cancel session 7?", detail = "It can be restored.", accept = "Cancel Session", keep = "Keep" } : null,
                reason = new { prompt = "Why?", placeholder = "e.g. moved", dismissed, blank },
            }))!;
        }

        [Fact]
        public void Arguments_runs_the_command_with_the_reason_only_once_both_are_given()
        {
            var asked = new List<string>();
            var args = ActionAsk.Arguments(
                Action("abort", null),
                confirmation => { asked.Add(confirmation.Accept); return true; },
                reason => { asked.Add(reason.Prompt); return "  scope moved  "; });

            Assert.Equal(new[] { "Cancel Session", "Why?" }, asked);
            Assert.Equal(new[] { "session", "cancel", "--session-number", "7", "--reason", "scope moved" }, args);

            Assert.Null(ActionAsk.Arguments(Action("abort", null), _ => true, _ => "   "));
            Assert.Equal(
                new[] { "session", "cancel", "--session-number", "7", "--reason", "the operator stopped the session" },
                ActionAsk.Arguments(Action("abort", "the operator stopped the session"), _ => true, _ => ""));
        }

        [Fact]
        public void Arguments_runs_nothing_when_a_dialog_is_dismissed()
        {
            var reasonAsked = false;
            Assert.Null(ActionAsk.Arguments(Action("abort", ""), _ => false, _ => { reasonAsked = true; return "why"; }));
            Assert.False(reasonAsked);

            Assert.Null(ActionAsk.Arguments(Action("abort", ""), _ => true, _ => null));

            // Where the router says a dismissed box is a blank one, the command runs with the blank.
            Assert.Equal(
                new[] { "session", "cancel", "--session-number", "7", "--reason", "" },
                ActionAsk.Arguments(Action("blank", ""), _ => true, _ => null));
        }
    }
}
