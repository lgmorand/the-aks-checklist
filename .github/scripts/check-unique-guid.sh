#!/bin/bash

echo "Checking that all GUIDs are unique"
echo ''
key_name="guid"

echo $key_name

for file in *.json
do
  echo -e "📜 \e[4mPROCESSING ${file^^}\e[0m"
 
  all_items_count=$(jq '. | length'  $file)

  echo "INFO: File $file has $all_items_count items"

  all_guids_count=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " | wc -l)

  f [ "$all_items_count" -ne "$all_guids_count" ]; then
    echo "ERROR: File $file has some elements without GUID"
  else

  unique_guids_count=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " | sort -u | wc -l)

  if [ "$all_guids_count" -eq "$unique_guids_count" ]; then
    echo -e " \e[0;32mOK\e[0m";
  else
    echo "ERROR: File $file has $all_guids_count GUIDs, but only $unique_guids_count are unique"
    echo "Here are the duplicates:"
    all_guids=$(cat $file | jq -r "try .. | objects | select( .$key_name ) | .$key_name " )

    printf '%s\n' "${all_guids[@]}"|awk '!($0 in seen){seen[$0];next} 1'
  fi


  echo ''
done
