using System;
using System.IO;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class WindowsTerminalTests
    {
        private static EngineLaunch Launch()
        {
            return EngineLaunch.Parse(
                "{\"program\":\"claude\",\"args\":[\"--model\",\"claude-opus-5-5\",\"Run it once; then stop.\"]," +
                "\"cwd\":\"D:\\\\Work\\\\My Repo\",\"env\":{\"DABBLER_ENGINE_PLACE\":\"1\"},\"title\":\"Claude Code\",\"typed\":null}");
        }

        [Fact]
        public void TabStartInfo_names_the_window_the_folder_and_the_program_and_sets_the_environment()
        {
            var info = WindowsTerminal.TabStartInfo(Launch(), @"C:\Tools\claude.cmd", @"C:\Ext\router", @"C:\Windows;C:\Tools");

            Assert.Equal("wt.exe", info.FileName);
            Assert.Equal(
                "-w Dabbler new-tab -d \"D:\\Work\\My Repo\" --title \"Claude Code\" C:\\Tools\\claude.cmd " +
                "--model claude-opus-5-5 \"Run it once\\; then stop.\"",
                info.Arguments);
            Assert.DoesNotContain("%", info.Arguments);
            Assert.False(info.UseShellExecute);
            Assert.Equal("1", info.Environment["DABBLER_ENGINE_PLACE"]);
            Assert.Equal(@"C:\Ext\router;C:\Windows;C:\Tools", info.Environment["PATH"]);
        }

        [Fact]
        public void ProgramPath_finds_the_program_with_its_extension()
        {
            var folder = Path.Combine(Path.GetTempPath(), "dabbler-path-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "claude"), "#!/bin/sh");
            File.WriteAllText(Path.Combine(folder, "claude.cmd"), "@echo off");
            try
            {
                Assert.Equal(Path.Combine(folder, "claude.cmd"), WindowsTerminal.ProgramPath("claude", @"C:\nowhere;" + folder, ".EXE;.CMD"));
                Assert.Equal("codex", WindowsTerminal.ProgramPath("codex", folder, ".EXE;.CMD"));
            }
            finally
            {
                Directory.Delete(folder, recursive: true);
            }
        }
    }
}
