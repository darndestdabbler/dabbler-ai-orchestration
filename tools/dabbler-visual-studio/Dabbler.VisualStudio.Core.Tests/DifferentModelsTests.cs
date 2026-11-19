using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class DifferentModelsTests
    {
        private static readonly string[] StartArgs = { "session", "start", "--sessions-dir", "docs/sessions" };

        private static ConfiguredChoice Configured()
        {
            object Row(string id, string? value, params object[] children) => new { id, value, children };
            return ConfiguredChoice.Read(JsonConvert.SerializeObject(new
            {
                schemaVersion = 1,
                machineOnly = false,
                configuration = Row("configuration", null,
                    Row("config:authoring", null,
                        Row("config:vehicle:authoring", "claude-code"),
                        Row("config:role:authoring", "claude-opus-5-5")),
                    Row("config:reviewing", null,
                        Row("config:vehicle:reviewing", "api"),
                        Row("config:role:primaryReviewer", "gpt-5.6-sol"),
                        Row("config:role:auxiliaryReviewer", "gemini-4-argon"))),
            }));
        }

        [Fact]
        public void Arguments_carries_each_of_five_answers_as_its_flag()
        {
            var answers = new DifferentModelsAnswers
            {
                Engine = "copilot",
                AuthoringModel = "claude-sonnet-5.5",
                ReviewerTransport = "copilot-cli",
                PrimaryReviewerModel = "gpt-5.6-terra",
                AuxiliaryReviewerModel = "gemini-4-neon",
            };

            Assert.Equal(
                new[]
                {
                    "session", "start", "--sessions-dir", "docs/sessions",
                    "--engine", "copilot",
                    "--model", "claude-sonnet-5.5",
                    "--reviewer-transport", "copilot-cli",
                    "--reviewer-model", "gpt-5.6-terra",
                    "--auxiliary-model", "gemini-4-neon",
                    "--json",
                },
                DifferentModels.Arguments(StartArgs, Configured(), answers));
        }

        [Fact]
        public void Arguments_carries_no_flag_for_an_answer_left_at_its_default()
        {
            // The engine is the configured one and the reviewing vehicle was not asked: neither is a flag.
            var answers = new DifferentModelsAnswers
            {
                Engine = "claude-code",
                AuthoringModel = "claude-sonnet-5-5",
                PrimaryReviewerModel = "gpt-5.6-sol",
                AuxiliaryReviewerModel = "gemini-4-neon",
            };

            Assert.Equal(
                new[] { "session", "start", "--sessions-dir", "docs/sessions", "--model", "claude-sonnet-5-5", "--auxiliary-model", "gemini-4-neon", "--json" },
                DifferentModels.Arguments(StartArgs, Configured(), answers));
        }

        [Fact]
        public void ViewArguments_reads_the_choices_for_the_answers_given_so_far()
        {
            Assert.Equal(new[] { "view", "configuration", "--repo-root", "R" }, DifferentModels.ViewArguments("R", new DifferentModelsAnswers()));
            Assert.Equal(
                new[] { "view", "configuration", "--repo-root", "R", "--engine", "copilot", "--reviewer-transport", "api" },
                DifferentModels.ViewArguments("R", new DifferentModelsAnswers { Engine = "copilot", ReviewerTransport = "api", PrimaryReviewerModel = "gpt-5.6-sol" }));
        }

        [Fact]
        public void ActionFor_finds_a_set_action_on_any_row()
        {
            var action = new { id = "dabblerSolution.setPrimaryReviewerModel", title = "Set the Primary Reviewer's Model", unavailable = "A session is in flight." };
            var row = new { id = "config:role:primaryReviewer", kind = "configRole", label = "Primary Reviewer", actions = new[] { action }, children = new object[0] };
            var root = new { id = "configuration", kind = "configuration", label = "Configuration", children = new[] { new { id = "config:reviewing", kind = "configParticipant", label = "Reviewing AI", children = new[] { row } } } };
            var document = ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, configuration = root }));

            Assert.Equal("A session is in flight.", DifferentModels.ActionFor(document, "dabblerSolution.setPrimaryReviewerModel")!.Unavailable);
            Assert.Null(DifferentModels.ActionFor(document, "dabblerSolution.setEngine"));
        }

        [Fact]
        public void Launching_opens_the_answered_engine_and_model_or_the_configured_ones()
        {
            var changed = DifferentModels.Launching(Configured(), new DifferentModelsAnswers { Engine = "copilot", AuthoringModel = "claude-sonnet-5.5" });
            Assert.Equal("copilot", changed.Engine);
            Assert.Equal("claude-sonnet-5.5", changed.AuthoringModel);

            var kept = DifferentModels.Launching(Configured(), new DifferentModelsAnswers());
            Assert.Equal("claude-code", kept.Engine);
            Assert.Equal("claude-opus-5-5", kept.AuthoringModel);
        }
    }
}
