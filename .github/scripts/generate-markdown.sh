#!/bin/bash

echo "Generating offline version"
echo ''

cd ./data/en/items

for entry in *.json
do
  echo -e "\e[4mPROCESSING ${entry^^}\e[0m"
 
  # creating file
  echo -ne "Creating ${entry%.json}.md"
  currentMdFile="../../../markdown/${entry%.json}.md";
  touch $currentMdFile
  echo -e " \e[0;32mOK\e[0m";
  
  # Inserting title
  echo -ne "Inserting title"
  echo "# ${entry%.json}" >> $currentMdFile
  echo -e " \e[0;32mOK\e[0m";

  # Inserting items
  echo -ne "Inserting items"
  echo "# ${entry%.json}" >> $currentMdFile
  echo -e " \e[0;32mOK\e[0m";

  echo ''
done

cd ../../..
