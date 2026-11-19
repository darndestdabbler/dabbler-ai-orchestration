using System;
using System.IO;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class EngineMessagesTests
    {
        [Fact]
        public void Each_kind_is_read_back_as_it_was_written()
        {
            var sent = new[]
            {
                EngineMessage.Attach(120, 30),
                EngineMessage.Attached(@"C:\repo", "Claude Code"),
                EngineMessage.Refused("This engine is open in another Visual Studio window."),
                EngineMessage.Output("\u001b[2Jline one\r\nline \"two\""),
                EngineMessage.Input("\u001b\r"),
                EngineMessage.Size(100, 40),
                EngineMessage.Exited(3),
                EngineMessage.End(),
            };
            var writer = new StringWriter();
            foreach (var message in sent) EngineMessages.Write(writer, message);

            var reader = new StringReader(writer.ToString());
            foreach (var message in sent)
            {
                var read = EngineMessages.Read(reader);
                Assert.NotNull(read);
                Assert.Equal(message.Kind, read!.Kind);
                Assert.Equal(message.Columns, read.Columns);
                Assert.Equal(message.Rows, read.Rows);
                Assert.Equal(message.Folder, read.Folder);
                Assert.Equal(message.Title, read.Title);
                Assert.Equal(message.Text, read.Text);
                Assert.Equal(message.Code, read.Code);
            }
            Assert.Null(EngineMessages.Read(reader));
        }

        [Fact]
        public void A_record_is_for_its_folder_whatever_the_case_or_trailing_separator()
        {
            var record = EngineRecord.Parse(new EngineRecord { Folder = @"C:\Repos\Shop", Title = "Claude Code", ProcessId = 42, Pipe = "dabbler-engine-1", StartedAt = DateTimeOffset.Now }.ToJson());
            Assert.NotNull(record);
            Assert.True(record!.IsFor(@"c:\repos\shop\"));
            Assert.False(record.IsFor(@"C:\Repos\Shop2"));
        }
    }
}
