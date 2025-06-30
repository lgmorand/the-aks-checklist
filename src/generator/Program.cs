using aks_generator;
using CommandLine;
using System.Text;

Options options = new Options();

Parser.Default.ParseArguments<Options>(args)
     .WithParsed<Options>(o =>
     {
         options = o;
     });

Console.WriteLine("AKS checklist HTML Generator");

var Generator = new Generator();

StringBuilder sb = new StringBuilder();
sb.AppendLine(Generator.ParseCategory("Identity - Authorization", options.Path, "identity.json"));
sb.AppendLine(Generator.ParseCategory("Cluster security", options.Path, "cluster_security.json"));
sb.AppendLine(Generator.ParseCategory("Multi-Tenant - Isolation", options.Path, "cluster_multi.json"));
sb.AppendLine(Generator.ParseCategory("Storage", options.Path, "storage.json"));
sb.AppendLine(Generator.ParseCategory("Networking", options.Path, "networking.json"));
sb.AppendLine(Generator.ParseCategory("Resource Management", options.Path, "resource_management.json"));
sb.AppendLine(Generator.ParseCategory("Cluster Operations", options.Path, "operations.json"));
sb.AppendLine(Generator.ParseCategory("Biz continuity - disaster recovery", options.Path, "bc_dr.json"));
sb.AppendLine(Generator.ParseCategory("Windows", options.Path, "windows.json"));
sb.AppendLine(Generator.ParseCategory("Application deployment", options.Path, "application.json"));
sb.AppendLine(Generator.ParseCategory("Image management", options.Path, "container.json"));

string textToInject = sb.ToString(); 
string dateToInject = DateTime.Now.ToString("dd-MM-yyyy");

// read content of file
string fileContent = File.ReadAllText(options.FilePath);
fileContent = fileContent.Replace("%DATE%", dateToInject);
fileContent = fileContent.Replace("%CONTENT%", textToInject);

// write content back to file
File.WriteAllText(options.OutputFile, fileContent);
