using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class RouterFollowTests
    {
        private static readonly TimeSpan Limit = TimeSpan.FromSeconds(30);

        // Prints its pid, then a document a beat later, and stays running as a follower does.
        private const string Follower =
            "console.log(JSON.stringify({ pid: process.pid }));" +
            "setTimeout(() => console.log(JSON.stringify({ n: 2 })), 200);" +
            "setInterval(() => {}, 1000);";

        [Fact]
        public void RouterFollow_hands_on_each_document_it_prints()
        {
            using var bundle = new FakeBundle(Follower);
            var documents = new BlockingCollection<string>();
            using (new RouterFollow(new Router(bundle.Path), bundle.Folder, new[] { "view", "work-explorer", "--follow" }, documents.Add))
            {
                Assert.True(documents.TryTake(out var first, Limit));
                Assert.StartsWith("{\"pid\":", first);
                Assert.True(documents.TryTake(out var second, Limit));
                Assert.Equal("{\"n\":2}", second);
            }
        }

        [Fact]
        public void Dispose_ends_the_router()
        {
            using var bundle = new FakeBundle(Follower);
            var documents = new BlockingCollection<string>();
            var follow = new RouterFollow(new Router(bundle.Path), bundle.Folder, new[] { "view", "configuration", "--follow" }, documents.Add);
            Assert.True(documents.TryTake(out var first, Limit));
            var pid = int.Parse(first.Split(':')[1].TrimEnd('}'));
            follow.Dispose();
            Process? running = null;
            try
            {
                running = Process.GetProcessById(pid);
            }
            catch (ArgumentException)
            {
                // Gone: what Dispose promises.
            }
            if (running != null) Assert.True(running.WaitForExit((int)Limit.TotalMilliseconds));
        }
    }
}
