source=${source:-en}
target=${target:-}

while [ $# -gt 0 ]; do

   if [[ $1 == *"--"* ]]; then
        param="${1/--/}"
        declare $param="$2"
        # echo $1 $2 // Optional to see the parameter:value result
   fi

  shift
done

if [[ "$target" == "" ]]
then 
    echo -e "\e[91mparameter --target is missing\e[0m"
else
    echo  ""
    echo  "###############################"
    echo  "#   Localization checker      #"
    echo  "###############################"

    echo "Installing required tools: jq"
    sudo apt-get install jq > /dev/null

    echo -e "Comparing \e[96m'$source'\e[0m to \e[96m'$target'\e[0m"
    echo ""
    
    sourceFolder=../$source/items
    targetFolder=../$target/items
    sourceFileNumber="$(ls $sourceFolder | wc -l)"
    targetFileNumber="$(ls $targetFolder | wc -l)"

    if [[ "$sourceFileNumber" != "$targetFileNumber" ]]
    then
        echo -e "\e[91mFolders $source ($sourceFileNumber) and $target ($targetFileNumber) do not have the same number of files\e[0m"
    else
        echo -e "\e[92mSame number of files between '$source' and '$target' \e[0m"
    fi
    
    for f in $sourceFolder/*
    do
        FILENAME=`basename ${f}`;
        echo -e "comparing \e[96m$f\e[0m to \e[96m$targetFolder/$FILENAME\e[0m"
        sourceCount="$(jq '. | length' $f)"
        targetCount="$(jq '. | length' $targetFolder/$FILENAME)"
        
        if [[ "$sourceCount" != "$targetCount" ]]
        then
            echo -e "\e[91mFiles $f($sourceCount) and $target ($targetCount) do not have the same number of elements\e[0m"
        else
            echo -e "\e[92mSame number of files between '$source' and '$target' \e[0m"
        fi

    done
fi