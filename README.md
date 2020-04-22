# The Azure Kubernetes Service Checklist

![AKS Checklist](https://github.com/lgmorand/aks-checklist/blob/master/src/img/banners/logo-aks-checklist.png)

The AKS Checklist is a (tentatively) exhaustive list of all elements you need to think of when preparing a cluster for production. It is based on all common best practices agreed around Kubernetes or documented [here](https://docs.microsoft.com/en-us/azure/aks/best-practices).

## Author

**[Louis-Guillaume MORAND](https://github.com/lgmorand)**

## Contributors

N/A

## How to contribute

Just do a pull request ;-)
Be aware that we want to keep a list an exhaustive as possible but also a list which met common usage. Depending on your context, you may have custom best practices which may just apply in your case.

## How to add a translation

There are up to four steps:

- copy the folder **/data/en** and translate all information
- in the localized files, modify the URL to target your langage (i.e: docs.microsoft.com/**YOURLANG**/link)
- copy the file **src/views/en.html** and translate it
- ensure that a flag is existing for your language (**/src/img/flags**)
- add a link for your lang in the header (**src/view/base/header.pug**)

## Thanks

The source code itself is a modified version of the [Front-End Checklist](https://github.com/thedaviddias/Front-End-Checklist) which was created by [David Dias](https://github.com/thedaviddias)
Icons made by Freepik from [www.flaticon.com](www.flaticon.com) is licensed by CC 3.0 BY

## License

[![CC0](https://i.creativecommons.org/p/zero/1.0/88x31.png)](https://creativecommons.org/publicdomain/zero/1.0/)
