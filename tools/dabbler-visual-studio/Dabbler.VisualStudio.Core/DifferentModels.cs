using System.Collections.Generic;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// What Start Session with Different Models was told: an engine, an
    /// authoring model, a reviewing vehicle and the two reviewers, for one
    /// session and written nowhere. Null is a question left unanswered.
    /// </summary>
    public sealed class DifferentModelsAnswers
    {
        public string? Engine { get; set; }

        public string? AuthoringModel { get; set; }

        public string? ReviewerTransport { get; set; }

        public string? PrimaryReviewerModel { get; set; }

        public string? AuxiliaryReviewerModel { get; set; }
    }

    /// <summary>
    /// Start Session with Different Models: the five questions, each asked
    /// from the pick the router prints for the answers before it, and the
    /// start they make. Which choices exist, and whether a start with them
    /// is allowed, is the router's.
    /// </summary>
    public static class DifferentModels
    {
        /// <summary>The set actions whose picks are the five questions, in the order they are asked.</summary>
        public static readonly IReadOnlyList<string> Questions = new[]
        {
            "dabblerSolution.setEngine",
            "dabblerSolution.setAuthoringModel",
            "dabblerSolution.setReviewerTransport",
            "dabblerSolution.setPrimaryReviewerModel",
            "dabblerSolution.setAuxiliaryReviewerModel",
        };

        /// <summary>
        /// The `dabbler view configuration` arguments whose picks are the
        /// choices for the answers given so far: the engine, the authoring
        /// model and the reviewing vehicle are the reading's own flags.
        /// </summary>
        public static IReadOnlyList<string> ViewArguments(string repositoryRoot, DifferentModelsAnswers answers)
        {
            var args = new List<string> { "view", "configuration", "--repo-root", repositoryRoot };
            Add(args, "--engine", answers.Engine, null);
            Add(args, "--authoring-model", answers.AuthoringModel, null);
            Add(args, "--reviewer-transport", answers.ReviewerTransport, null);
            return args;
        }

        /// <summary>The first action in <paramref name="document"/> with <paramref name="id"/>, or null where no row offers it.</summary>
        public static ConfigurationAction? ActionFor(ConfigurationDocument document, string id)
        {
            return Walk(document.Configuration).SelectMany(row => row.Actions).FirstOrDefault(action => action.Id == id);
        }

        /// <summary>
        /// The start's arguments: <paramref name="startArgs"/> (the row's
        /// Start Session command without `dabbler`), then each answer that
        /// differs from what this repository is configured with as its flag
        /// -- one left at its default carries none, and the start reads it
        /// from the Configuration -- then `--json`.
        /// </summary>
        public static IReadOnlyList<string> Arguments(IReadOnlyList<string> startArgs, ConfiguredChoice configured, DifferentModelsAnswers answers)
        {
            var args = startArgs.ToList();
            Add(args, "--engine", answers.Engine, configured.Engine);
            Add(args, "--model", answers.AuthoringModel, configured.AuthoringModel);
            Add(args, "--reviewer-transport", answers.ReviewerTransport, configured.ReviewerTransport);
            Add(args, "--reviewer-model", answers.PrimaryReviewerModel, configured.PrimaryReviewerModel);
            Add(args, "--auxiliary-model", answers.AuxiliaryReviewerModel, configured.AuxiliaryReviewerModel);
            args.Add("--json");
            return args;
        }

        /// <summary>The engine and authoring model the session's engine tab opens with: each answer, or the configured value.</summary>
        public static ConfiguredChoice Launching(ConfiguredChoice configured, DifferentModelsAnswers answers)
        {
            return configured.With(Given(answers.Engine) ?? configured.Engine, Given(answers.AuthoringModel) ?? configured.AuthoringModel);
        }

        private static void Add(List<string> args, string flag, string? answer, string? configured)
        {
            var value = Given(answer);
            if (value == null || value == configured) return;
            args.Add(flag);
            args.Add(value);
        }

        private static string? Given(string? answer)
        {
            return string.IsNullOrWhiteSpace(answer) ? null : answer!.Trim();
        }

        private static IEnumerable<ConfigurationRow> Walk(ConfigurationRow row)
        {
            yield return row;
            foreach (var below in row.Children.SelectMany(Walk)) yield return below;
        }
    }
}
