# READ CAREFULLY Thanks for contributing !! :)

## Branch staging

Do a merge on the **Staging branch**, NOT master. Github Actions does not allow to share secrets so during a PR, I can only do a build validation. I need an in-between branch to be able to deploy on a staging environment (https://stoakscheckliststaging.z16.web.core.windows.net/)

## Translation

If you added a translation, please ensure that you didn't forget anything:

- copy the folder **/data/en** and translate all information
- in the localized files, modify the URL to target your langage (i.e: docs.microsoft.com/**YOURLANG**/link)
- copy the file **src/views/en.html** and translate it
- ensure that a flag is existing for your language (**/src/img/flags**)
- add a link for your lang in the header (**src/view/base/header.pug**)
- add your name to contributors