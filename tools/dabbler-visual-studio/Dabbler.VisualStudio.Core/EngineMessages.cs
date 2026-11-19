using System;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>What a pane and an engine host say to each other.</summary>
    [JsonConverter(typeof(StringEnumConverter), typeof(CamelCaseNamingStrategy))]
    public enum EngineMessageKind
    {
        /// <summary>A pane asks for the engine, at its size.</summary>
        Attach,

        /// <summary>The host's answer: the pane has the engine.</summary>
        Attached,

        /// <summary>The host's answer: another pane has it, and the sentence to show.</summary>
        Refused,

        /// <summary>What the engine printed.</summary>
        Output,

        /// <summary>What was typed at the engine.</summary>
        Input,

        /// <summary>The pane's new size.</summary>
        Size,

        /// <summary>The engine has exited, with its code.</summary>
        Exited,

        /// <summary>The pane asks the host to end its engine.</summary>
        End,
    }

    /// <summary>One message; only the members its kind carries are set.</summary>
    public sealed class EngineMessage
    {
        [JsonProperty("type", Required = Required.Always)]
        public EngineMessageKind Kind { get; set; }

        [JsonProperty("columns", NullValueHandling = NullValueHandling.Ignore)]
        public int? Columns { get; set; }

        [JsonProperty("rows", NullValueHandling = NullValueHandling.Ignore)]
        public int? Rows { get; set; }

        [JsonProperty("folder", NullValueHandling = NullValueHandling.Ignore)]
        public string? Folder { get; set; }

        [JsonProperty("title", NullValueHandling = NullValueHandling.Ignore)]
        public string? Title { get; set; }

        [JsonProperty("text", NullValueHandling = NullValueHandling.Ignore)]
        public string? Text { get; set; }

        [JsonProperty("code", NullValueHandling = NullValueHandling.Ignore)]
        public int? Code { get; set; }

        public static EngineMessage Attach(int columns, int rows) => new EngineMessage { Kind = EngineMessageKind.Attach, Columns = columns, Rows = rows };

        public static EngineMessage Attached(string folder, string title) => new EngineMessage { Kind = EngineMessageKind.Attached, Folder = folder, Title = title };

        public static EngineMessage Refused(string text) => new EngineMessage { Kind = EngineMessageKind.Refused, Text = text };

        public static EngineMessage Output(string text) => new EngineMessage { Kind = EngineMessageKind.Output, Text = text };

        public static EngineMessage Input(string text) => new EngineMessage { Kind = EngineMessageKind.Input, Text = text };

        public static EngineMessage Size(int columns, int rows) => new EngineMessage { Kind = EngineMessageKind.Size, Columns = columns, Rows = rows };

        public static EngineMessage Exited(int code) => new EngineMessage { Kind = EngineMessageKind.Exited, Code = code };

        public static EngineMessage End() => new EngineMessage { Kind = EngineMessageKind.End };
    }

    /// <summary>
    /// The pipe between a pane and a host carries one JSON object per line:
    /// JSON writes a line break inside a string as an escape, so a line is
    /// always exactly one message.
    /// </summary>
    public static class EngineMessages
    {
        /// <summary>One message, written whole and flushed.</summary>
        public static void Write(TextWriter writer, EngineMessage message)
        {
            writer.Write(JsonConvert.SerializeObject(message, Formatting.None) + "\n");
            writer.Flush();
        }

        /// <summary>The next message, or null at the end of the stream.</summary>
        /// <exception cref="FormatException">A line that is not a message.</exception>
        public static EngineMessage? Read(TextReader reader)
        {
            var line = reader.ReadLine();
            if (line == null) return null;
            try
            {
                return JsonConvert.DeserializeObject<EngineMessage>(line) ?? throw new FormatException("An empty line is not an engine message.");
            }
            catch (JsonException error)
            {
                throw new FormatException($"Not an engine message: {error.Message}", error);
            }
        }
    }

    /// <summary>
    /// What a running host says about itself in its file under
    /// %LOCALAPPDATA%\Dabbler\engines, so a Visual Studio opened later finds it.
    /// </summary>
    public sealed class EngineRecord
    {
        [JsonProperty("folder")]
        public string Folder { get; set; } = "";

        [JsonProperty("title")]
        public string Title { get; set; } = "";

        [JsonProperty("processId")]
        public int ProcessId { get; set; }

        [JsonProperty("pipe")]
        public string Pipe { get; set; } = "";

        [JsonProperty("startedAt")]
        public DateTimeOffset StartedAt { get; set; }

        /// <summary>The folder that holds the records.</summary>
        public static string RecordsFolder =>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dabbler", "engines");

        public string ToJson() => JsonConvert.SerializeObject(this);

        /// <summary>The record in <paramref name="json"/>, or null where it is not one.</summary>
        public static EngineRecord? Parse(string json)
        {
            try
            {
                var record = JsonConvert.DeserializeObject<EngineRecord>(json);
                return record == null || record.Folder.Length == 0 || record.Pipe.Length == 0 ? null : record;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        /// <summary>Whether this engine runs for the repository at <paramref name="folder"/>.</summary>
        public bool IsFor(string folder) => string.Equals(Normal(Folder), Normal(folder), StringComparison.OrdinalIgnoreCase);

        private static string Normal(string folder) => Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }
}
