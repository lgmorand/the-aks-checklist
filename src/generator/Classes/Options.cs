

using CommandLine;

namespace aks_generator
{
    internal class Options
    {
        [Option('p', "path", Required = true, HelpText = "Path to folder containing JSON files")]
        public required string Path
        {
            get;set;
        }

        [Option('f', "filepath", Required = true, HelpText = "Path to file where to inject content")]

        public required string FilePath
        {
            get;set;
        }

        [Option('o', "output", Required = true, HelpText = "Path to file generated")]

        public required string OutputFile
        {
            get; set;
        }
    }
}
