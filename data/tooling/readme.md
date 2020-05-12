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
comparing ../en/items/clustersetup.json to ../fr/items/clustersetup.json
Files ../en/items/clustersetup.json(9) and fr (8) do not have the same number of elements
comparing ../en/items/container.json to ../fr/items/container.json
comparing ../en/items/development.json to ../fr/items/development.json
Files ../en/items/development.json(11) and fr (10) do not have the same number of elements
comparing ../en/items/disasterrecovery.json to ../fr/items/disasterrecovery.json
comparing ../en/items/multitenancy.json to ../fr/items/multitenancy.json
comparing ../en/items/network.json to ../fr/items/network.json
comparing ../en/items/operations.json to ../fr/items/operations.json
Files ../en/items/operations.json(7) and fr (6) do not have the same number of elements
comparing ../en/items/resourcemanagement.json to ../fr/items/resourcemanagement.json
comparing ../en/items/storage.json to ../fr/items/storage.json
comparing ../en/items/windows.json to ../fr/items/windows.json

Comparing 'en' to 'es'
-----------------------

Folders 'en' and 'es' do not have the same number of files
../es/items/windows.json does not exist
```
