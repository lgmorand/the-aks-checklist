# The Azure Kubernetes Service Checklist

![Build and deploy on prod](https://github.com/lgmorand/aks-checklist/workflows/Build%20and%20deploy%20on%20prod/badge.svg) ![Last commit](https://img.shields.io/github/last-commit/lgmorand/aks-checklist.svg) ![License](https://img.shields.io/github/license/lgmorand/aks-checklist.svg)

Deployed version can be found here: [www.the-aks-checklist.com](https://www.the-aks-checklist.com)
![AKS Checklist](https://raw.githubusercontent.com/lgmorand/aks-checklist/master/src/img/social/facebook-banner.jpg)

The AKS Checklist is a (tentatively) exhaustive list of all elements you need to think of when preparing a cluster for production. It is based on all common best practices agreed around Kubernetes or documented [here](https://docs.microsoft.com/en-us/azure/aks/best-practices).

Another good reading in another format is the [AKS baseline reference architecture](https://github.com/mspnp/aks-secure-baseline) 

## Author

**[Louis-Guillaume MORAND](https://github.com/lgmorand)**

## Contributors

**[Fernando Mejía](https://github.com/feranto)**

**[Michael Withrow](https://github.com/miwithro)**

**[Tommy Falgout](https://github.com/lastcoolnameleft)**

## How to contribute

Fork the repo, add the best practices in the items.json file (at least in English which will remain the single source of trust) and then do a pull request **on the staging branch** ;-)

Be aware that we want to keep a list an exhaustive as possible but also a list that met **common usage**. Depending on your context, you may have custom best practices which may apply only to your case.

## How to add a translation

There are up to six steps:

- copy the folder **/data/en** and translate all information
- in the localized files, modify the URL to target your langage (i.e: docs.microsoft.com/**YOURLANG**/link)
- copy the file **src/views/en.html** and translate it
- ensure that a flag is existing for your language (**/src/img/flags**)
- add a link for your lang in the header (**src/view/base/header.pug**)
- add your name to contributors

## Thanks

The source code itself is a modified version of the [Front-End Checklist](https://github.com/thedaviddias/Front-End-Checklist) which was created by [David Dias](https://github.com/thedaviddias)
Icons made by Freepik from [www.flaticon.com](www.flaticon.com) is licensed by CC 3.0 BY

## License

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
