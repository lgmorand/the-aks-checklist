#!/bin/bash

echo "Checking that all GUIDs are present and unique"
echo ''

key_name="guid"
globalError=0

cd ./data/en/items

for file in *.json
do
  echo -e "\e[4mPROCESSING ${file^^}\e[0m"
 
  hasError=0

  all_items_count=$(jq '. | length'  $file)

  echo "INFO: File $file has $all_items_count items"

  all_guids_count=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " | wc -l)

  if [ "$all_items_count" -ne "$all_guids_count" ]; then
    echo -e "\e[0;31mERROR\e[0m: File $file has some elements without GUID ($all_guids_count GUID found). Each block should have a guid property"
    hasError=1
  else
    echo "All items have a GUID"
  fi

  unique_guids_count=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " | sort -u | wc -l)

  if [ "$all_guids_count" -ne "$unique_guids_count" ]; then

    echo -e "\e[0;31mERROR\e[0m: File $file has $all_guids_count GUIDs, but only $unique_guids_count are unique"
    echo "Here are the duplicates:"
    all_guids=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " )

    printf '%s\n' "${all_guids[@]}"|awk '!($0 in seen){seen[$0];next} 1'
    hasError=1
  else
    echo "All GUIDs are unique"
  fi

  if [[ "$hasError" == 1 ]]; then
    globalError=1
    echo -e " \e[0;31mKO\e[0m All tests are not green";
  else
    echo -e " \e[0;32mOK\e[0m All tests are green";
  fi
   
  echo ''
done

# Global uniqueness check across ALL files (the per-file loop above only
# detects duplicates within a single file, not across different files)
echo -e "\e[4mGLOBAL UNIQUENESS CHECK (across all files)\e[0m"

global_guids=$(jq -r "try .. | objects | select( .$key_name ) | .$key_name" *.json)
global_total=$(printf '%s\n' "$global_guids" | wc -l)
global_unique=$(printf '%s\n' "$global_guids" | sort -u | wc -l)

if [ "$global_total" -ne "$global_unique" ]; then
  echo -e "\e[0;31mERROR\e[0m: $global_total GUIDs found across all files, but only $global_unique are unique"
  echo "Here are the duplicates:"
  printf '%s\n' "$global_guids" | sort | uniq -d
  globalError=1
  echo -e " \e[0;31mKO\e[0m All tests are not green"
else
  echo "All GUIDs are unique across all files"
  echo -e " \e[0;32mOK\e[0m All tests are green"
fi

echo ''

# If there was an error, exit to fail the build
if [[ "$globalError" == 1 ]]; then
    exit 1
fi

cd ../../..
