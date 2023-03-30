import os
import pandas as pd
import json

dir_path = r'../en/items/'
# list to store files
filenames = []
# Iterate directory
for file in os.listdir(dir_path):
    # check only json files
    if file.endswith('.json'):
        filenames.append(file)


def move_optional(dictionary,optionals = ["scale","simple","ha","cost","graph","security"]):
    dic = {}
    for optional in optionals:
        try:
            dic[optional] = dictionary[optional]
            dictionary.pop(optional)
        except KeyError:
            print(f'no {optional} for {dictionary["title"]}')
    dictionary['optionalFields'] = {'score':dic}
    return dictionary

def get_updated_content(file):
    with open(dir_path + file) as f:
        contents = json.load(f)
    reformattedContent = []
    for content in contents:
        reformattedContent.append(move_optional(content))
    return reformattedContent

for file in filenames:
    with open(file, 'w', encoding='utf-8') as f:
        json.dump(get_updated_content(file), f, ensure_ascii=False, indent=2)