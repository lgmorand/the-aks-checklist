#!/bin/bash

logfile="result.txt"
rm -f $logfile

echo  ""
echo  "###############################" 2>&1 | tee -a $logfile
echo  "#   Localization checker      #" 2>&1 | tee -a $logfile
echo  "###############################" 2>&1 | tee -a $logfile


echo "if this script triggers unknown command error, reencode it with LF instead of CRLF"

echo "Installing required tools: jq for parsing JSON"
sudo apt-get install jq -y > /dev/null

function CompareLang()
(
   local source=$1
   local target=$2
   
    echo ""
    echo -e "Comparing '$source' to '$target'"  2>&1 | tee -a $logfile
    echo "-----------------------"
    echo ""

    sourceFolder="../$source/items"
    targetFolder="../$target/items"
    sourceFileNumber="$(ls $sourceFolder | wc -l)"
    targetFileNumber="$(ls $targetFolder | wc -l)"

    if [ "$sourceFileNumber" != "$targetFileNumber" ]
    then
        echo -e "Folders '$source' and '$target' do not have the same number of files"  2>&1 | tee -a $logfile

        for f in $sourceFolder/*
        do
            FILENAME=`basename ${f}`;

            targetFile="$targetFolder/$FILENAME"
            if [ ! -f "$targetFile" ]; then
                echo -e "$targetFile does not exist"  2>&1 | tee -a $logfile
            fi
        done

        echo -e "Please fix missing files and rerun the tool to search for missing content"  2>&1 | tee -a $logfile
    else
        echo -e "Same number of files between '$source' and '$target'"  2>&1 | tee -a $logfile
        echo -e "Checking if files content are the same:"  2>&1 | tee -a $logfile
        for f in $sourceFolder/*
        do
            FILENAME=`basename ${f}`;
            # echo -e "comparing $f to $targetFolder/$FILENAME"  2>&1 | tee -a $logfile
            sourceCount="$(jq '. | length' $f)"
            targetCount="$(jq '. | length' $targetFolder/$FILENAME)"
            
            if [[ "$sourceCount" != "$targetCount" ]]
            then
                echo -e "Files $f($sourceCount) and $target ($targetCount) do not have the same number of elements"  2>&1 | tee -a $logfile
            fi

        done
    fi

)

CompareLang "en" "fr"
CompareLang "en" "es"

echo ""
echo -e "\e[92mComparison done. Open $logfile \e[0m"  
