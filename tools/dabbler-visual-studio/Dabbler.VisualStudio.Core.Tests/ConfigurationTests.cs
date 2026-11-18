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
                        Row("config:role:primaryReviewer", "gpt-5.6-sol"))),
            });
        }

        [Fact]
        public void Read_finds_the_chosen_engine_and_models_or_says_what_is_missing()
        {
            var chosen = ConfiguredChoice.Read(Document("claude-code", "claude-opus-5-5", "claude-fable-5-1"));
            Assert.Equal("claude-code", chosen.Engine);
            Assert.Equal("claude-opus-5-5", chosen.AuthoringModel);
            Assert.Equal("claude-fable-5-1", chosen.MechanicModel);
            Assert.Null(chosen.Missing);

            var unchosen = ConfiguredChoice.Read(Document(null, "claude-opus-5-5", null));
            Assert.Null(unchosen.Engine);
            Assert.Null(unchosen.MechanicModel);
            Assert.Contains("an engine is not chosen", unchosen.Missing);
            Assert.Contains("Dabbler Configuration window", unchosen.Missing);

            Assert.Throws<System.FormatException>(() => ConfiguredChoice.Read("[1]"));
        }
    }
}
