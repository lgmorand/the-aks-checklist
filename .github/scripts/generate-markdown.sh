#!/bin/bash

echo "Generating offline version"
echo ''

cd ./data/en/items

for entry in *.json
do
  echo -e "📜 \e[4mPROCESSING ${entry^^}\e[0m"
 
  # creating file
  echo -ne "Creating ${entry%.json}.md"
  currentMdFile="../../../markdown/${entry%.json}.md";
  touch $currentMdFile
  echo -e " \e[0;32mOK\e[0m";
  
  # Inserting title
  echo -ne "Inserting title"
  echo "# ${entry%.json}" >> $currentMdFile
  echo "" >> $currentMdFile
  echo -e " \e[0;32mOK\e[0m";

  # Inserting items
  echo -ne "Inserting items"
  jq -c .[] ${entry} | while read item; do

    # subtitle
    title=`echo $item | jq -r '.title'`
    echo "# $title" >> $currentMdFile
    echo "" >> $currentMdFile

    # description
    description=`echo $item | jq -r '.description'`
    echo "$description" >> $currentMdFile

    # detail
    detail=`echo $item | jq -r '.detail'`
    if [ -n "$detail" ] && [ "$detail" != "null" ]
    then
      echo "$detail" >> $currentMdFile
    fi
    echo "" >> $currentMdFile

    # documentation
    echo $item | jq -r -c '.documentation[]' | while read documentation; do
        # echo $documentation
        docText=`echo $documentation | jq -r '.title'`
        url=`echo $documentation | jq -r '.url'`
        echo "- [$docText]($url)" >> $currentMdFile
    done

    echo "" >> $currentMdFile
  done
  
  echo -e " \e[0;32mOK\e[0m";

  echo ''
done

cd ../../..
