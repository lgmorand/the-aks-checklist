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
  title=${entry%.json}
  echo "# ${title^}" >> $currentMdFile
  echo "" >> $currentMdFile
  echo -e " \e[0;32mOK\e[0m";

  # Inserting items
  echo -ne "Inserting items"
  jq -c .[] ${entry} | while read item; do

    # subtitle
    title=`echo $item | jq -r '.title'`
    echo "## $title" >> $currentMdFile
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
    echo $item | jq -r -c '.documentation[]?' | while read documentation; do
        #echo $documentation
        if [ -n "$documentation" ] && [ "$documentation" != "null" ]
        then
          if [ -z "$docTitleSet" ] 
          then
              echo "**Documentation**" >> $currentMdFile
              echo "" >> $currentMdFile
              docTitleSet="done"
          fi

          docText=`echo $documentation | jq -r '.title'`
          url=`echo $documentation | jq -r '.url'`
          echo "- [$docText]($url)" >> $currentMdFile
        fi
    done

    # tools
    echo $item | jq -r -c '.tools[]?' | while read tool; do
        #echo $tools
        if [ -n "$tool" ] && [ "$tool" != "null" ]
        then
          if [ -z "$toolsTitleSet" ] 
          then
              echo "**Tools**" >> $currentMdFile
              echo "" >> $currentMdFile
              toolsTitleSet="done"
          fi 
          
          toolText=`echo $tool | jq -r '.title'`
          toolUrl=`echo $tool | jq -r '.url'`
          echo "- [$toolText]($toolUrl)" >> $currentMdFile
        fi
    done

    echo "" >> $currentMdFile
  done
  
  echo -e " \e[0;32mOK\e[0m";

  echo ''
done

cd ../../..
