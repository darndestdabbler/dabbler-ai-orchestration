using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class ConfigurationTests
    {
        private static string Document(string? engine, string? authoring, string? mechanic)
        {
            object Row(string id, string? value, params object[] children) => new { id, value, children };
            return JsonConvert.SerializeObject(new
            {
                schemaVersion = 1,
                machineOnly = false,
                configuration = Row("configuration", null,
                    Row("config:authoring", null,
                        Row("config:vehicle:authoring", engine),
                        Row("config:role:authoring", authoring),
                        Row("config:role:mechanic", mechanic)),
                    Row("config:reviewing", null,
                        Row("config:vehicle:reviewing", "api"),
                        Row("config:role:primaryReviewer", "gpt-5.6-sol"),
                        Row("config:role:auxiliaryReviewer", null))),
            });
        }

        [Fact]
        public void Read_finds_the_chosen_engine_and_models_or_says_what_is_missing()
        {
            var chosen = ConfiguredChoice.Read(Document("claude-code", "claude-opus-5-5", "claude-fable-5-1"));
            Assert.Equal("claude-code", chosen.Engine);
            Assert.Equal("claude-opus-5-5", chosen.AuthoringModel);
            Assert.Equal("claude-fable-5-1", chosen.MechanicModel);
            Assert.Equal("api", chosen.ReviewerTransport);
            Assert.Equal("gpt-5.6-sol", chosen.PrimaryReviewerModel);
            Assert.Null(chosen.AuxiliaryReviewerModel);
            Assert.Null(chosen.Missing);

            var unchosen = ConfiguredChoice.Read(Document(null, "claude-opus-5-5", null));
            Assert.Null(unchosen.Engine);
            Assert.Null(unchosen.MechanicModel);
            Assert.Contains("an engine is not chosen", unchosen.Missing);
            Assert.Contains("Dabbler Configuration window", unchosen.Missing);

            Assert.Throws<System.FormatException>(() => ConfiguredChoice.Read("[1]"));
        }

        [Fact]
        public void Parse_reads_a_row_and_refuses_another_shape()
        {
            var choice = new { label = "codex", description = (string?)null, detail = "what you chose", value = "codex", unreachable = "codex is not on PATH", argv = new[] { "dabbler", "configure", "--engine", "codex" }, mineArgv = new[] { "dabbler", "configure", "--engine", "codex", "--mine" } };
            var action = new { id = "dabblerSolution.setEngine", title = "Set the Authoring Vehicle", argv = (string[]?)null, pick = new { title = "Which engine?", placeholder = "", choices = new[] { choice }, withheld = new[] { new { label = "copilot", reason = "not installed" } }, typed = (object?)null }, confirm = (object?)null, unavailable = (string?)null };
            var row = new { id = "config:vehicle:authoring", kind = "configVehicle", label = "Vehicle", description = "codex · this repository", value = "codex", decidedLayer = "checkout", click = action, actions = new[] { action }, children = new object[0] };
            var document = ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, unread = new[] { "api" }, configuration = row }));

            Assert.Equal("checkout", document.Configuration.DecidedLayer);
            Assert.Equal(new[] { "api" }, document.Unread);
            Assert.Empty(ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, configuration = row })).Unread);
            var pick = document.Configuration.Click!.Pick!;
            Assert.Equal("codex is not on PATH", Assert.Single(pick.Choices).Unreachable);
            Assert.Equal("not installed", Assert.Single(pick.Withheld).Reason);

            Assert.Throws<System.FormatException>(() => ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 2, machineOnly = false, configuration = row })));
        }
    }
}
