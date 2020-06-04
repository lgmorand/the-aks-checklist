# Tooling for localization

This small script is made to help to see if a difference exists between the different languages, like a missing best practice

## How to run it ?

```console
. ./localization-checker.sh
```

## Expected result

```bash
###############################
#   Localization checker      #
###############################
Installing required tools: jq for parsing JSON

Comparing 'en' to 'fr'
-----------------------

Same number of files between 'en' and 'fr'
Checking if files content are the same:
Files ../en/items/clustersetup.json(10) and fr (8) do not have the same number of elements
Files ../en/items/development.json(11) and fr (10) do not have the same number of elements
Files ../en/items/operations.json(9) and fr (6) do not have the same number of elements

Comparing 'en' to 'es'
-----------------------

Folders 'en' and 'es' do not have the same number of files
../es/items/windows.json does not exist
Please fix missing files and rerun the tool to search for missing content

Comparison done. Open result.txt
```
