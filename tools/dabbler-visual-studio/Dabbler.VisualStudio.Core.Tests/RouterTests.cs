using System;
using System.Collections.Generic;
using System.IO;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    /// <summary>A stand-in bundle: a script run by the same `node` the router is.</summary>
    internal sealed class FakeBundle : IDisposable
    {
        public FakeBundle(string script)
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"dabbler-fake-{Guid.NewGuid():N}.js");
            File.WriteAllText(Path, script);
        }

        public string Path { get; }

        public string Folder => System.IO.Path.GetTempPath();

        public void Dispose() => File.Delete(Path);
    }

    internal sealed class RecordingEcho : IRouterEcho
    {
        public List<string> Lines { get; } = new List<string>();

        public void Running(string commandLine) => Lines.Add(commandLine);

        public void Wrote(string output) => Lines.Add(output);
    }

    public class RouterTests
    {
        private static readonly TimeSpan Limit = TimeSpan.FromSeconds(30);

        [Fact]
        public void Run_returns_what_the_verb_printed_and_echoes_the_command()
        {
            using var bundle = new FakeBundle("process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\\n');");
            var echo = new RecordingEcho();
            var output = new Router(bundle.Path, echo).Run(bundle.Folder, new[] { "version", "--reason", "a \"quoted\" word\\" }, Limit);
            Assert.Equal("[\"version\",\"--reason\",\"a \\\"quoted\\\" word\\\\\"]\n", output);
            Assert.Equal("dabbler version --reason \"a \\\"quoted\\\" word\\\\\"", echo.Lines[0]);
            Assert.Equal(output, echo.Lines[1]);
        }

        [Fact]
        public void Run_reports_a_failure_in_the_routers_words()
        {
            using var bundle = new FakeBundle("console.error('refused: no session is open'); process.exit(3);");
            var failure = Assert.Throws<RouterFailure>(() => new Router(bundle.Path).Run(bundle.Folder, new[] { "session", "next" }, Limit));
            Assert.Equal("refused: no session is open", failure.Message);
            Assert.Equal(3, failure.ExitCode);
        }
    }
}
