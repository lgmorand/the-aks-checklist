### Step 2: take the old items and convert them to the format we need to make it work in FTA checklist
import uuid
import os
import pandas as pd
import json

need_to_compare = False # variable used to identify if the checklist needs to be compared with the FTA checklist
# get the mapping table that converts filename to the correct category name in FTA's checklist
filename_map = pd.read_csv('filename_map.csv')

# convert the mapping table to a mapping dictionary that can more easily be used
filename_map_dict = {}
for filename, actualname in zip(filename_map['filename'],filename_map['actualname']):
    filename_map_dict[filename] = actualname

def get_subcategory(tags):
    """function to get the first tag that isnt all"""
    relevant_tags = [x for x in tags if x != "all"]
    if len(relevant_tags) > 0:
        return relevant_tags[0].title()
    else:
        return "other"

def get_link(entry):
    """ function to get documentation link """
    if 'documentation' in entry.keys():
        try:
            context = entry['documentation'][0]
        except IndexError:
            context = {"title":"none available","url":""}        
    elif 'tools' in entry.keys():
        try:
            context = entry['tools'][0]
        except IndexError:
            context = {"title":"none available","url":""}
    else:
        context = {"title":"none available","url":""}
    return context["url"]

def transform(item,filename):
    transformed_item = dict()
    title = item['title']
    transformed_item['text'] =  title
    transformed_item["description"] = item["description"]
    try:
        transformed_item["guid"] = item["guid"]
    except: 
        transformed_item["guid"] = ""
    transformed_item['subcategory'] =  get_subcategory(item['tags'])
    try:
        transformed_item['category'] = filename_map_dict[filename]
    except KeyError:
        print(f'cant find {filename} in the dictionary')
        pass
    transformed_item['severity'] = item['priority']
    transformed_item['link'] = get_link(item)
    optionals = ["scale","simple","ha","cost","graph","security"]
    for optional in optionals:
        try:
            transformed_item[optional] = item['optionalFields']['score'][optional]
        except KeyError:
            print(f'cant find {optional} for {title} ')
    return transformed_item

dir_path = r'../en/items/'
# list to store files
filenames = []
# Iterate directory
for file in os.listdir(dir_path):
    # check only json files
    if file.endswith('.json'):
        filenames.append(file)
# print(filenames)

## get the items in all the different files in the dir_path. start by initializing the transformed
# items list
items = []
# get all the categories available in the mapping table so files in the dir not in the 
# considered categories (eg cluster_setup) are not considered
categories = filename_map_dict.keys()

# iterate over the files
for file in filenames:
    # remove .json from filename
    file2 = file.split(".")[0]
    # check to make sure that the filename is in categories
    if file2 in categories:
        # get the content of the file
        with open(dir_path + file) as f:
            content = json.load(f)
        # transform each item in the file to the FT data format
        for item in content:
            transformed_item = transform(item,file2)
            if need_to_compare:
                transformed_item["source"] = 'the-aks-checklist' # temporary step to help us identify missing items from the-aks-checklist
            items.append(transformed_item)
        print(f"finished {file2}")    
    else:
        print(f'cant find {file2} in the dictionary')
        pass
checklist = {}
checklist["categories"] = [
        {
            "name": "Identity and Access Management"
        },
        {
            "name": "Network Topology and Connectivity"
        },
        {
            "name": "BC and DR"
        },
        {
            "name": "Governance and Security"
        },
        {
            "name": "Resource Organization and Cost Governance "
        },
        {
            "name": "Operations"
        },
        {
            "name": "Application Deployment"
        },
        {
            "name": "Windows"
        },
        {
            "name": "Storage"
        },
    ]
checklist["status"] =  [
        {
            "name": "Not verified",
            "description": "This check has not been looked at yet"
        },
        {
            "name": "Open",
            "description": "There is an action item associated to this check"
        },
        {
            "name": "Fulfilled",
            "description": "This check has been verified, and there are no further action items associated to it"
        },
        {
            "name": "Not required",
            "description": "Recommendation understood, but not needed by current requirements"
        },
        {
            "name": "N/A",
            "description": "Not applicable for current design"
        }
    ]
checklist["severities"] = [
        {
            "name": "High"
        },
        {
            "name": "Medium"
        },
        {
            "name": "Low"
        }
    ]
checklist["metadata"] =  {
        "name": "Azure AKS Review",
        "state": "GA"
    }
checklist["items"] = items
# finally we pull the ft data and append it to the transformed data then save it in the ft file. this need only be ran once
# with open("./ft_data.json") as f:
#     content = json.load(f)
#     combined_list = content["items"] + items
#     content["items"] = combined_list

with open("aks_checklist.en.json", 'w', encoding='utf-8') as f:
    json.dump(checklist, f, ensure_ascii=False, indent=2)

# lets get the combined list as a csv
if need_to_compare:
    pd.DataFrame(combined_list).to_csv("combined.csv",index=False)