import json
import pandas as pd

### Step 1 get rid of the cluster setup category as we believe all categories are required for cluster setup. its content will be disbursed to
### the relevant category

# get the cluster_setup file that will have its content moved to the correct category(files) as we dont need 
# this category anymore
with open('cluster_setup.json') as f:
    superHeroSquad = json.load(f)

# we need to create a dictionary that maps the correct filename to the index of the entries in cluster_setup.json
destination = dict()
# the csv file has the correct filename to move the cluster_setup item  to in the correct order. reset index creates a new column
# that is the index that will be used in a future step
cluster_create_map = pd.read_csv("cluster_create_map.csv").reset_index()
# lets get the unique categories we have in the csv file
for category in cluster_create_map["destination"].drop_duplicates():
    # we will filter for the subset rows that belong to that category
    context = cluster_create_map[cluster_create_map["destination"] == category]["index"]
    # the index we be added to the dictionary with the key being the category name
    destination[category] = context.to_list()

def append_entries(filename,entries):
    """ function that takes a list of new entries and appends them to 
    a json file that contains a list"""
    print(filename)
    print(len(entries))
    filename = filename + ".json"
    # get the current content of the json file
    with open(filename) as f:
        content = json.load(f)
    # append the new content to it 
    content = content + entries
    # write the appended list to the file
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(content, f, ensure_ascii=False, indent=2)

# for each category we had in the list of cluster_setup items
for category, value in destination.items():
    entries = []
    # for each index value that corresponds to the entry we want to get added to that category
    for entry in destination[category]:
        # add the cluster setup entry that corresponds to that index to a list. this list of cluster setup 
        # entries can then be added to the list we will add to the correct file
        entries.append(superHeroSquad[entry])
    # run the function that takes the list and adds it to the correct file
    append_entries(category,entries)


