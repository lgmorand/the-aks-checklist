# Thanks for contributing !! Sharing/Helping is caring :)

## Branch staging

Do a merge on the Staging branch, NOT master

## PR validation

Be aware that any PR will have to be green to be validated. Github Actions will ensure a build is successful but will also deploy on the staging environment (https://stoakscheckliststaging.z16.web.core.windows.net/) where you can check the result of your PR and how it renders

## Translation

If you added a translation, please ensure that you didn't forget anything:

- copy the folder **/data/en** and translate all information
- in the localized files, modify the URL to target your langage (i.e: docs.microsoft.com/**YOURLANG**/link)
- copy the file **src/views/en.html** and translate it
- ensure that a flag is existing for your language (**/src/img/flags**)
- add a link for your lang in the header (**src/view/base/header.pug**)
- add your name to contributors